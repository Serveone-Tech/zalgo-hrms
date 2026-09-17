import { Router } from "express";
import { z } from "zod";
import { and, eq, desc, asc, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, employees, employeeSalaries, salaryComponents, salaryAdvances, payrollRuns, payrollItems, branches, departments, designations } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, badRequest, conflict, forbidden } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant, assertBranchInTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule, hasPermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { employeeScopeWhere } from "../../common/scope.js";
import { fullName } from "../employees/employees.service.js";
import { emitToCompany } from "../../sockets.js";
import { processRun, markPaid, statutoryFor, DEFAULT_COMPONENTS, activeSalary, num } from "./payroll.service.js";
import { computePay, type Component } from "./payroll.engine.js";
import { streamPayslip } from "./payslip.pdf.js";
import { notify } from "../notifications/notify.service.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("payroll"));
const monthRe = z.string().regex(/^\d{4}-\d{2}$/);
const cid = (req: any) => req.tenant!.companyId as string;

// ---- Components ----
const compSchema = z.object({ name: z.string().min(2), code: z.string().min(2).max(20).toUpperCase(), type: z.enum(["earning", "deduction"]), calc: z.enum(["fixed", "percent_basic", "percent_gross"]).default("fixed"), defaultValue: z.coerce.number().min(0).default(0), isTaxable: z.boolean().default(true), isProrated: z.boolean().default(true), sortOrder: z.coerce.number().int().default(0), isActive: z.boolean().default(true) });
r.get("/components", requirePermission("payroll.view"), asyncHandler(async (req, res) => { ok(res, await db.select().from(salaryComponents).where(eq(salaryComponents.companyId, cid(req))).orderBy(asc(salaryComponents.sortOrder))); }));
r.post("/components", requirePermission("payroll.process"), validate(compSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof compSchema>;
  const [dupe] = await db.select({ id: salaryComponents.id }).from(salaryComponents).where(and(eq(salaryComponents.companyId, cid(req)), eq(salaryComponents.code, b.code))).limit(1);
  if (dupe) throw conflict("Component code exists");
  const [row] = await db.insert(salaryComponents).values({ ...b, defaultValue: String(b.defaultValue), companyId: cid(req) }).returning();
  audit(req, "create", "salary_component", row.id, { code: row.code }); created(res, row, "Component created");
}));
r.put("/components/:id", requirePermission("payroll.process"), validate(compSchema.partial()), asyncHandler(async (req, res) => {
  const b = req.body as any; const patch: any = { ...b, updatedAt: new Date() }; if (b.defaultValue !== undefined) patch.defaultValue = String(b.defaultValue);
  const [row] = await db.update(salaryComponents).set(patch).where(and(eq(salaryComponents.id, req.params.id), eq(salaryComponents.companyId, cid(req)))).returning();
  if (!row) throw notFound("Component not found");
  audit(req, "update", "salary_component", row.id, b); ok(res, row, "Component updated");
}));
r.post("/components/seed-defaults", requirePermission("payroll.process"), asyncHandler(async (req, res) => {
  let n = 0; for (const c of DEFAULT_COMPONENTS) { const [row] = await db.insert(salaryComponents).values({ ...c, companyId: cid(req) }).onConflictDoNothing().returning(); if (row) n++; }
  ok(res, { created: n }, `${n} components created`);
}));
// ---- Statutory settings (in company.settings.payroll) ----
r.get("/settings", requirePermission("payroll.view"), asyncHandler(async (req, res) => { const s = await statutoryFor(cid(req)); ok(res, { ...s, pt: { ...s.pt, slabs: s.pt.slabs.map((x) => ({ upto: x.upto === Infinity ? null : x.upto, amount: x.amount })) } }); }));
r.put("/settings", requirePermission("payroll.process"), validate(z.object({ pf: z.object({ enabled: z.boolean(), employeePct: z.coerce.number(), employerPct: z.coerce.number(), wageCeiling: z.coerce.number(), restrictToCeiling: z.boolean() }), esi: z.object({ enabled: z.boolean(), employeePct: z.coerce.number(), employerPct: z.coerce.number(), grossCeiling: z.coerce.number() }), pt: z.object({ enabled: z.boolean(), slabs: z.array(z.object({ upto: z.coerce.number().nullable(), amount: z.coerce.number() })) }), roundNet: z.boolean() })), asyncHandler(async (req, res) => {
  const [c] = await db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, cid(req))).limit(1);
  await db.update(companies).set({ settings: { ...(c.settings as object), payroll: req.body }, updatedAt: new Date() }).where(eq(companies.id, cid(req)));
  audit(req, "update", "payroll_settings", cid(req), req.body as any); ok(res, req.body, "Statutory settings saved");
}));

// ---- Employee salary structure ----
const salarySchema = z.object({ effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ctcMonthly: z.coerce.number().min(0).default(0), components: z.array(z.object({ componentId: z.string().uuid(), code: z.string(), value: z.coerce.number().min(0) })), pfOptIn: z.boolean().default(true), esiOptIn: z.boolean().default(true), ptApplicable: z.boolean().default(true), tdsMonthly: z.coerce.number().min(0).default(0), paymentMode: z.enum(["bank", "cash", "cheque", "upi"]).default("bank"), note: z.string().optional() });
async function scopedEmp(req: any, id: string) { const scope = await employeeScopeWhere(req, employees); const [e] = await db.select().from(employees).where(and(eq(employees.id, id), scope)).limit(1); if (!e) throw notFound("Employee not found"); return e; }
r.get("/employees/:id/salary", requirePermission("payroll.view"), asyncHandler(async (req, res) => {
  const e = await scopedEmp(req, req.params.id);
  const history = await db.select().from(employeeSalaries).where(eq(employeeSalaries.employeeId, e.id)).orderBy(desc(employeeSalaries.effectiveFrom));
  const current = history[0] ?? null;
  let preview = null;
  if (current) { const comps = (await db.select().from(salaryComponents).where(and(eq(salaryComponents.companyId, cid(req)), eq(salaryComponents.isActive, true)))) as unknown as Component[]; preview = computePay({ structure: { components: current.components, pfOptIn: current.pfOptIn, esiOptIn: current.esiOptIn, ptApplicable: current.ptApplicable, tdsMonthly: num(current.tdsMonthly) }, comps, statutory: await statutoryFor(cid(req)), daysInMonth: 30, payableDays: 30 }); }
  ok(res, { current, history, preview });
}));
r.put("/employees/:id/salary", requirePermission("payroll.process"), validate(salarySchema), asyncHandler(async (req, res) => {
  const e = await scopedEmp(req, req.params.id); const b = req.body as z.infer<typeof salarySchema>;
  if (!b.components.some((c) => c.code === "BASIC")) throw badRequest("Structure must include BASIC");
  const [row] = await db.insert(employeeSalaries).values({ ...b, ctcMonthly: String(b.ctcMonthly), tdsMonthly: String(b.tdsMonthly), companyId: cid(req), employeeId: e.id, createdBy: req.user!.id }).returning();
  audit(req, "salary_revision", "employee", e.id, { effectiveFrom: b.effectiveFrom, ctc: b.ctcMonthly }); ok(res, row, "Salary structure saved");
}));
r.post("/preview", requirePermission("payroll.view"), validate(salarySchema.pick({ components: true, pfOptIn: true, esiOptIn: true, ptApplicable: true, tdsMonthly: true })), asyncHandler(async (req, res) => {
  const b = req.body as any; const comps = (await db.select().from(salaryComponents).where(and(eq(salaryComponents.companyId, cid(req)), eq(salaryComponents.isActive, true)))) as unknown as Component[];
  ok(res, computePay({ structure: b, comps, statutory: await statutoryFor(cid(req)), daysInMonth: 30, payableDays: 30 }));
}));
// ---- Advances / loans ----
r.get("/advances", requirePermission("payroll.view"), asyncHandler(async (req, res) => {
  const scope = await employeeScopeWhere(req, employees);
  ok(res, await db.select({ ...salaryAdvances as any, employeeName: fullName, employeeCode: employees.employeeCode }).from(salaryAdvances).innerJoin(employees, eq(employees.id, salaryAdvances.employeeId)).where(scope).orderBy(desc(salaryAdvances.createdAt)));
}));
r.post("/advances", requirePermission("payroll.process"), validate(z.object({ employeeId: z.string().uuid(), type: z.enum(["advance", "loan"]).default("advance"), amount: z.coerce.number().positive(), installment: z.coerce.number().positive(), startMonth: monthRe, note: z.string().optional() })), asyncHandler(async (req, res) => {
  const b = req.body as any; await scopedEmp(req, b.employeeId);
  const [row] = await db.insert(salaryAdvances).values({ ...b, amount: String(b.amount), installment: String(Math.min(b.installment, b.amount)), companyId: cid(req), createdBy: req.user!.id }).returning();
  audit(req, "create", "salary_advance", row.id, b); created(res, row, `${b.type} recorded`);
}));
r.post("/advances/:id/close", requirePermission("payroll.process"), asyncHandler(async (req, res) => {
  const [row] = await db.update(salaryAdvances).set({ status: "closed" }).where(and(eq(salaryAdvances.id, req.params.id), eq(salaryAdvances.companyId, cid(req)))).returning();
  if (!row) throw notFound("Not found"); audit(req, "close", "salary_advance", row.id); ok(res, row, "Closed");
}));

// ---- Runs ----
r.get("/runs", requirePermission("payroll.view"), asyncHandler(async (req, res) => { ok(res, await db.select({ ...payrollRuns as any, branchName: branches.name }).from(payrollRuns).leftJoin(branches, eq(branches.id, payrollRuns.branchId)).where(eq(payrollRuns.companyId, cid(req))).orderBy(desc(payrollRuns.month))); }));
r.post("/runs", requirePermission("payroll.process"), validate(z.object({ month: monthRe, branchId: z.string().uuid().optional().nullable(), note: z.string().optional() })), asyncHandler(async (req, res) => {
  const b = req.body as { month: string; branchId?: string | null; note?: string };
  if (b.branchId) await assertBranchInTenant(req, b.branchId);
  const [dupe] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.companyId, cid(req)), eq(payrollRuns.month, b.month), b.branchId ? eq(payrollRuns.branchId, b.branchId) : sql`${payrollRuns.branchId} is null`)).limit(1);
  if (dupe) throw conflict("A payroll run already exists for this month/branch");
  const [run] = await db.insert(payrollRuns).values({ companyId: cid(req), month: b.month, branchId: b.branchId ?? null, note: b.note, createdBy: req.user!.id }).returning();
  const u = await processRun(run.id);
  audit(req, "process", "payroll_run", run.id, { month: b.month, employees: u.employeeCount }); created(res, u, `Payroll processed for ${u.employeeCount} employees`);
}));
async function loadRun(req: any, id: string) { const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, id), eq(payrollRuns.companyId, cid(req)))).limit(1); if (!run) throw notFound("Run not found"); return run; }
r.get("/runs/:id", requirePermission("payroll.view"), asyncHandler(async (req, res) => {
  const run = await loadRun(req, req.params.id);
  const items = await db.select({ ...payrollItems as any, employeeName: fullName, employeeCode: employees.employeeCode, designationName: designations.name, departmentName: departments.name, branchName: branches.name }).from(payrollItems).innerJoin(employees, eq(employees.id, payrollItems.employeeId)).leftJoin(designations, eq(designations.id, employees.designationId)).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(branches, eq(branches.id, payrollItems.branchId)).where(eq(payrollItems.runId, run.id)).orderBy(employees.employeeCode);
  ok(res, { ...run, items });
}));
r.post("/runs/:id/reprocess", requirePermission("payroll.process"), asyncHandler(async (req, res) => { const run = await loadRun(req, req.params.id); const u = await processRun(run.id); audit(req, "reprocess", "payroll_run", run.id); ok(res, u, `Reprocessed ${u.employeeCount} employees`); }));
r.post("/runs/:id/items/:itemId/hold", requirePermission("payroll.process"), validate(z.object({ hold: z.boolean(), remarks: z.string().optional() })), asyncHandler(async (req, res) => {
  const run = await loadRun(req, req.params.id); if (["approved", "paid"].includes(run.status)) throw badRequest("Run is locked");
  const b = req.body as { hold: boolean; remarks?: string };
  const [it] = await db.update(payrollItems).set({ status: b.hold ? "held" : "computed", remarks: b.remarks, updatedAt: new Date() }).where(and(eq(payrollItems.id, req.params.itemId), eq(payrollItems.runId, run.id))).returning();
  if (!it) throw notFound("Item not found"); ok(res, it, b.hold ? "Salary held" : "Salary released");
}));
r.post("/runs/:id/approve", requirePermission("payroll.approve"), asyncHandler(async (req, res) => {
  const run = await loadRun(req, req.params.id); if (run.status !== "pending_approval") throw conflict("Run is not pending approval");
  const [u] = await db.update(payrollRuns).set({ status: "approved", approvedBy: req.user!.id, approvedAt: new Date(), updatedAt: new Date() }).where(eq(payrollRuns.id, run.id)).returning();
  audit(req, "approve", "payroll_run", run.id, { month: run.month, net: run.totalNet }); ok(res, u, "Payroll approved");
}));
r.post("/runs/:id/pay", requirePermission("payroll.approve"), asyncHandler(async (req, res) => {
  const run = await loadRun(req, req.params.id); if (run.status !== "approved") throw conflict("Approve the run first");
  await markPaid(run.id);
  const [u] = await db.update(payrollRuns).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() }).where(eq(payrollRuns.id, run.id)).returning();
  emitToCompany(cid(req), "payroll:paid", { month: run.month });
  { const its = await db.select({ userId: employees.userId, net: payrollItems.net }).from(payrollItems).innerJoin(employees, eq(employees.id, payrollItems.employeeId)).where(and(eq(payrollItems.runId, run.id), eq(payrollItems.status, "paid"))); for (const it of its) if (it.userId) await notify({ companyId: cid(req), userIds: [it.userId], type: "payroll.paid", title: `Salary for ${run.month} credited`, body: `Net pay ₹${Number(it.net).toLocaleString("en-IN")}. Payslip is available under My payslips.`, link: "/app/payroll/me", priority: "success" }); }
  audit(req, "pay", "payroll_run", run.id, { month: run.month }); ok(res, u, "Marked as paid — payslips are now visible to employees");
}));
r.post("/runs/:id/cancel", requirePermission("payroll.approve"), asyncHandler(async (req, res) => {
  const run = await loadRun(req, req.params.id); if (run.status === "paid") throw conflict("Paid payroll cannot be cancelled");
  await db.delete(payrollRuns).where(eq(payrollRuns.id, run.id));
  audit(req, "cancel", "payroll_run", run.id, { month: run.month }); ok(res, null, "Run deleted");
}));
// Bank transfer sheet (CSV)
r.get("/runs/:id/bank-sheet.csv", requirePermission("payroll.approve"), asyncHandler(async (req, res) => {
  const run = await loadRun(req, req.params.id);
  const items = await db.select({ it: payrollItems, name: fullName, code: employees.employeeCode }).from(payrollItems).innerJoin(employees, eq(employees.id, payrollItems.employeeId)).where(and(eq(payrollItems.runId, run.id), sql`${payrollItems.status} <> 'held'`));
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["Employee Code,Name,Bank,Account Number,IFSC,Account Holder,Net Pay", ...items.map(({ it, name, code }) => [code, name, it.bankSnapshot?.bankName, it.bankSnapshot?.accountNumber, it.bankSnapshot?.ifsc, it.bankSnapshot?.accountHolder, it.net].map(esc).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", `attachment; filename="bank-sheet-${run.month}.csv"`); res.send(csv);
}));

// ---- Payslips ----
const myEmp = async (req: any) => { const [e] = await db.select().from(employees).where(and(eq(employees.companyId, cid(req)), eq(employees.userId, req.user!.id))).limit(1); return e; };
r.get("/payslips/me", asyncHandler(async (req, res) => {
  const e = await myEmp(req); if (!e) return ok(res, []);
  ok(res, await db.select({ id: payrollItems.id, month: payrollItems.month, gross: payrollItems.gross, totalDeductions: payrollItems.totalDeductions, net: payrollItems.net, payableDays: payrollItems.payableDays, lopDays: payrollItems.lopDays, paidAt: payrollRuns.paidAt }).from(payrollItems).innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.runId)).where(and(eq(payrollItems.employeeId, e.id), eq(payrollRuns.status, "paid"))).orderBy(desc(payrollItems.month)));
}));
r.get("/payslips/:itemId", asyncHandler(async (req, res) => {
  const [it] = await db.select().from(payrollItems).where(and(eq(payrollItems.id, req.params.itemId), eq(payrollItems.companyId, cid(req)))).limit(1);
  if (!it) throw notFound("Payslip not found");
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, it.runId)).limit(1);
  const me = await myEmp(req);
  if (!(hasPermission(req, "payroll.view") || me?.id === it.employeeId)) throw forbidden();
  if (me?.id === it.employeeId && !hasPermission(req, "payroll.view") && run.status !== "paid") throw forbidden("Payslip not released yet");
  const [e] = await db.select({ e: employees, designation: designations.name, department: departments.name, branch: branches.name }).from(employees).leftJoin(designations, eq(designations.id, employees.designationId)).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(branches, eq(branches.id, employees.branchId)).where(eq(employees.id, it.employeeId)).limit(1);
  const [co] = await db.select().from(companies).where(eq(companies.id, cid(req))).limit(1);
  if (req.query.format === "json") return ok(res, { ...it, employee: { name: `${e.e.firstName} ${e.e.lastName}`.trim(), ...e }, company: co.name });
  streamPayslip(res, co, { name: `${e.e.firstName} ${e.e.lastName}`.trim(), employeeCode: e.e.employeeCode, designation: e.designation, department: e.department, branch: e.branch, joiningDate: e.e.joiningDate, panNumber: e.e.panNumber, uanNumber: e.e.uanNumber }, it as any);
}));
void activeSalary;
export default r;
