import { Router } from "express";
import { z } from "zod";
import { and, eq, desc, gte, lte, inArray, sql, asc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { leaveTypes, leaveBalances, leaveRequests, leaveLedger, employees, users, branches, departments } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, badRequest, forbidden, conflict } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule, hasPermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { employeeScopeWhere } from "../../common/scope.js";
import { fullName } from "../employees/employees.service.js";
import { processEmployeeDay } from "../attendance/attendance.service.js";
import { emitToCompany } from "../../sockets.js";
import { getOrCreateBalance, credit, workingDays, overlapExists, accrueForCompany, assertPolicy, available, num } from "./leave.service.js";
import { notify, managerUser, userOfEmployee } from "../notifications/notify.service.js";
import { emitEvent } from "../automation/engine.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("leaves"));
const dateRe = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const me = async (req: any) => { const [e] = await db.select().from(employees).where(and(eq(employees.companyId, req.tenant!.companyId), eq(employees.userId, req.user!.id))).limit(1); return e ?? null; };
const yearOf = (d: string) => Number(d.slice(0, 4));

// ---------- Leave types ----------
const typeSchema = z.object({
  name: z.string().min(2).max(80), code: z.string().min(1).max(10).toUpperCase(), isPaid: z.boolean().default(true), kind: z.enum(["leave", "wfh", "comp_off"]).default("leave"),
  annualQuota: z.coerce.number().min(0).default(0), accrual: z.enum(["yearly", "monthly", "none"]).default("yearly"), carryForwardMax: z.coerce.number().min(0).default(0),
  encashable: z.boolean().default(false), allowHalfDay: z.boolean().default(true), allowNegative: z.boolean().default(false), approvalLevels: z.coerce.number().int().min(1).max(2).default(1),
  minNoticeDays: z.coerce.number().int().min(0).default(0), maxConsecutiveDays: z.coerce.number().int().min(1).optional().nullable(), applicableGenders: z.array(z.string()).optional().nullable(),
  probationAllowed: z.boolean().default(true), isActive: z.boolean().default(true), sortOrder: z.coerce.number().int().default(0),
});
const toRow = (b: any) => ({ ...b, annualQuota: String(b.annualQuota), carryForwardMax: String(b.carryForwardMax) });
r.get("/types", asyncHandler(async (req, res) => { ok(res, await db.select().from(leaveTypes).where(eq(leaveTypes.companyId, req.tenant!.companyId)).orderBy(asc(leaveTypes.sortOrder), leaveTypes.name)); }));
r.post("/types", requirePermission("leave.approve"), validate(typeSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof typeSchema>;
  const [dupe] = await db.select({ id: leaveTypes.id }).from(leaveTypes).where(and(eq(leaveTypes.companyId, req.tenant!.companyId), eq(leaveTypes.code, b.code))).limit(1);
  if (dupe) throw conflict("Leave code already exists");
  const [row] = await db.insert(leaveTypes).values({ ...toRow(b), companyId: req.tenant!.companyId }).returning();
  audit(req, "create", "leave_type", row.id, { code: row.code }); created(res, row, "Leave type created");
}));
r.put("/types/:id", requirePermission("leave.approve"), validate(typeSchema.partial()), asyncHandler(async (req, res) => {
  const b = req.body as any; const patch: any = { ...b, updatedAt: new Date() };
  if (b.annualQuota !== undefined) patch.annualQuota = String(b.annualQuota); if (b.carryForwardMax !== undefined) patch.carryForwardMax = String(b.carryForwardMax);
  const [row] = await db.update(leaveTypes).set(patch).where(and(eq(leaveTypes.id, req.params.id), eq(leaveTypes.companyId, req.tenant!.companyId))).returning();
  if (!row) throw notFound("Leave type not found");
  audit(req, "update", "leave_type", row.id, b); ok(res, row, "Leave type updated");
}));
r.post("/types/seed-defaults", requirePermission("leave.approve"), asyncHandler(async (req, res) => {
  const defaults = [
    { name: "Casual Leave", code: "CL", annualQuota: 12, accrual: "monthly", carryForwardMax: 0, sortOrder: 1 },
    { name: "Sick Leave", code: "SL", annualQuota: 8, accrual: "yearly", carryForwardMax: 0, sortOrder: 2, minNoticeDays: 0 },
    { name: "Earned Leave", code: "EL", annualQuota: 15, accrual: "monthly", carryForwardMax: 30, encashable: true, minNoticeDays: 3, sortOrder: 3 },
    { name: "Leave Without Pay", code: "LWP", isPaid: false, annualQuota: 0, accrual: "none", allowNegative: true, sortOrder: 4 },
    { name: "Maternity Leave", code: "ML", annualQuota: 182, accrual: "yearly", applicableGenders: ["female"], allowHalfDay: false, approvalLevels: 2, sortOrder: 5, probationAllowed: false },
    { name: "Paternity Leave", code: "PL", annualQuota: 7, accrual: "yearly", applicableGenders: ["male"], allowHalfDay: false, sortOrder: 6 },
    { name: "Compensatory Off", code: "CO", annualQuota: 0, accrual: "none", kind: "comp_off", sortOrder: 7 },
    { name: "Work From Home", code: "WFH", annualQuota: 0, accrual: "none", kind: "wfh", allowNegative: true, sortOrder: 8 },
  ];
  let n = 0;
  for (const d of defaults) { const [row] = await db.insert(leaveTypes).values({ ...toRow({ ...typeSchema.parse(d) }), companyId: req.tenant!.companyId }).onConflictDoNothing().returning(); if (row) n++; }
  await accrueForCompany(req.tenant!.companyId);
  audit(req, "seed", "leave_type", null, { created: n }); ok(res, { created: n }, `${n} leave types created and balances allocated`);
}));
r.post("/accrue", requirePermission("leave.approve"), asyncHandler(async (req, res) => { const n = await accrueForCompany(req.tenant!.companyId); ok(res, { credited: n }, `Accrual run: ${n} credits`); }));

// ---------- Balances ----------
const balanceRows = async (companyId: string, employeeId: string, year: number) => {
  const types = await db.select().from(leaveTypes).where(and(eq(leaveTypes.companyId, companyId), eq(leaveTypes.isActive, true))).orderBy(asc(leaveTypes.sortOrder));
  const out = [];
  for (const t of types) { const b = await getOrCreateBalance(companyId, employeeId, t.id, year); out.push({ ...b, type: t, available: available(b) }); }
  return out;
};
r.get("/balances/me", asyncHandler(async (req, res) => {
  const e = await me(req); if (!e) return ok(res, null);
  const year = Number(req.query.year ?? new Date().getFullYear());
  ok(res, { employeeId: e.id, year, balances: await balanceRows(e.companyId, e.id, year) });
}));
r.get("/balances/:employeeId", requirePermission("leave.view"), asyncHandler(async (req, res) => {
  const scope = await employeeScopeWhere(req, employees);
  const [e] = await db.select().from(employees).where(and(eq(employees.id, req.params.employeeId), scope)).limit(1);
  if (!e) throw notFound("Employee not found");
  const year = Number(req.query.year ?? new Date().getFullYear());
  const ledger = await db.select().from(leaveLedger).where(and(eq(leaveLedger.employeeId, e.id), eq(leaveLedger.year, year))).orderBy(desc(leaveLedger.createdAt)).limit(100);
  ok(res, { employeeId: e.id, year, balances: await balanceRows(e.companyId, e.id, year), ledger });
}));
r.post("/balances/adjust", requirePermission("leave.approve"), validate(z.object({ employeeId: z.string().uuid(), leaveTypeId: z.string().uuid(), year: z.coerce.number().int(), delta: z.coerce.number(), note: z.string().min(2) })), asyncHandler(async (req, res) => {
  const b = req.body as { employeeId: string; leaveTypeId: string; year: number; delta: number; note: string };
  const scope = await employeeScopeWhere(req, employees);
  const [e] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, b.employeeId), scope)).limit(1);
  if (!e) throw notFound("Employee not found");
  await credit(req.tenant!.companyId, e.id, b.leaveTypeId, b.year, b.delta, b.delta >= 0 ? "adjustment" : "adjustment", "adjusted", b.note, req.user!.id);
  audit(req, "adjust", "leave_balance", e.id, b); ok(res, null, "Balance adjusted");
}));
// Comp-off credit for working on holiday/week-off
r.post("/balances/comp-off", requirePermission("leave.approve"), validate(z.object({ employeeId: z.string().uuid(), days: z.coerce.number().min(0.5).max(5), workedOn: dateRe, note: z.string().optional() })), asyncHandler(async (req, res) => {
  const b = req.body as { employeeId: string; days: number; workedOn: string; note?: string };
  const [t] = await db.select().from(leaveTypes).where(and(eq(leaveTypes.companyId, req.tenant!.companyId), eq(leaveTypes.kind, "comp_off"))).limit(1);
  if (!t) throw badRequest("No comp-off leave type configured");
  await credit(req.tenant!.companyId, b.employeeId, t.id, yearOf(b.workedOn), b.days, "comp_off", "adjusted", `Worked on ${b.workedOn}${b.note ? ": " + b.note : ""}`, req.user!.id);
  audit(req, "comp_off", "leave_balance", b.employeeId, b); ok(res, null, `${b.days} comp-off credited`);
}));

// ---------- Requests ----------
const applySchema = z.object({ leaveTypeId: z.string().uuid(), fromDate: dateRe, toDate: dateRe, halfDay: z.enum(["first_half", "second_half"]).optional().nullable(), reason: z.string().max(1000).optional(), contactDuringLeave: z.string().max(60).optional(), employeeId: z.string().uuid().optional() });
const withNames = (where: any, limit = 200) => db.select({ ...leaveRequests as any, employeeName: fullName, employeeCode: employees.employeeCode, departmentName: departments.name, branchName: branches.name, typeName: leaveTypes.name, typeCode: leaveTypes.code, typeKind: leaveTypes.kind, isPaid: leaveTypes.isPaid, approvalLevels: leaveTypes.approvalLevels, reportingManagerId: employees.reportingManagerId })
  .from(leaveRequests).innerJoin(employees, eq(employees.id, leaveRequests.employeeId)).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId)).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(branches, eq(branches.id, employees.branchId)).where(where).orderBy(desc(leaveRequests.createdAt)).limit(limit);

r.post("/requests", validate(applySchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof applySchema>;
  let emp;
  if (b.employeeId && hasPermission(req, "leave.approve")) { const scope = await employeeScopeWhere(req, employees); [emp] = await db.select().from(employees).where(and(eq(employees.id, b.employeeId), scope)).limit(1); }
  else { if (!hasPermission(req, "leave.apply")) throw forbidden("Missing permission: leave.apply"); emp = await me(req); }
  if (!emp) throw badRequest("Your login is not linked to an employee record");
  if (b.toDate < b.fromDate) throw badRequest("End date is before start date");
  if (b.halfDay && b.fromDate !== b.toDate) throw badRequest("Half-day applies to a single date");
  const [t] = await db.select().from(leaveTypes).where(and(eq(leaveTypes.id, b.leaveTypeId), eq(leaveTypes.companyId, emp.companyId))).limit(1);
  if (!t) throw notFound("Leave type not found");
  const { days } = await workingDays(emp.companyId, emp.id, emp.branchId, b.fromDate, b.toDate, b.halfDay);
  if (days <= 0) throw badRequest("Selected dates are all holidays / week-offs");
  assertPolicy(t, emp, b.fromDate, days, b.halfDay);
  if (await overlapExists(emp.id, b.fromDate, b.toDate)) throw conflict("Overlaps an existing leave request");
  if (t.kind === "leave" && !t.allowNegative) { const bal = await getOrCreateBalance(emp.companyId, emp.id, t.id, yearOf(b.fromDate)); if (available(bal) < days) throw badRequest(`Insufficient ${t.name} balance (${available(bal)} available, ${days} requested)`, "INSUFFICIENT_BALANCE"); }
  const [row] = await db.insert(leaveRequests).values({ companyId: emp.companyId, branchId: emp.branchId, employeeId: emp.id, leaveTypeId: t.id, fromDate: b.fromDate, toDate: b.toDate, halfDay: b.halfDay ?? null, days: String(days), reason: b.reason, contactDuringLeave: b.contactDuringLeave }).returning();
  emitToCompany(emp.companyId, "leave:requested", { id: row.id, employeeId: emp.id, managerId: emp.reportingManagerId, days });
  { const m = await managerUser(emp.id); if (m) await notify({ companyId: emp.companyId, userIds: [m], type: "leave.requested", title: `Leave request: ${emp.firstName} ${emp.lastName}`, body: `${t.name} ${b.fromDate}${b.toDate !== b.fromDate ? " to " + b.toDate : ""} (${days} day${days === 1 ? "" : "s"})${b.reason ? " — " + b.reason : ""}`, link: "/app/leaves" }); }
  emitEvent("leave.requested", { companyId: emp.companyId, employeeId: emp.id, days, typeCode: t.code });
  audit(req, "apply", "leave_request", row.id, { type: t.code, from: b.fromDate, to: b.toDate, days }); created(res, row, `${t.name} applied for ${days} day(s)`);
}));
r.get("/requests/me", asyncHandler(async (req, res) => { const e = await me(req); if (!e) return ok(res, []); ok(res, await withNames(eq(leaveRequests.employeeId, e.id))); }));
// Pending approvals for me (manager: my reports at level 1; HR with leave.approve: level 2 or all)
r.get("/requests/pending", asyncHandler(async (req, res) => {
  const e = await me(req); const isHR = hasPermission(req, "leave.approve");
  const conds: any[] = [];
  if (e) conds.push(and(eq(leaveRequests.status, "pending"), eq(employees.reportingManagerId, e.id)));
  if (isHR) { const scope = await employeeScopeWhere(req, employees); conds.push(and(scope, inArray(leaveRequests.status, ["pending", "manager_approved"]))); }
  if (!conds.length) return ok(res, []);
  ok(res, await withNames(conds.length === 1 ? conds[0] : sql`(${conds[0]}) or (${conds[1]})`));
}));
r.get("/requests", requirePermission("leave.view"), asyncHandler(async (req, res) => {
  const scope = await employeeScopeWhere(req, employees);
  const status = req.query.status as string | undefined; const from = req.query.from as string | undefined; const to = req.query.to as string | undefined;
  ok(res, await withNames(and(scope, status ? eq(leaveRequests.status, status as any) : undefined, from ? gte(leaveRequests.toDate, from) : undefined, to ? lte(leaveRequests.fromDate, to) : undefined)));
}));
// Calendar: who is on leave in a range (team visibility)
r.get("/calendar", asyncHandler(async (req, res) => {
  const from = dateRe.parse(req.query.from); const to = dateRe.parse(req.query.to);
  const scope = hasPermission(req, "leave.view") ? await employeeScopeWhere(req, employees) : eq(employees.companyId, req.tenant!.companyId);
  ok(res, await withNames(and(scope, eq(leaveRequests.status, "approved"), lte(leaveRequests.fromDate, to), gte(leaveRequests.toDate, from)), 1000));
}));

async function loadReq(req: any, id: string) {
  const [row] = await withNames(and(eq(leaveRequests.id, id), eq(leaveRequests.companyId, req.tenant!.companyId)), 1) as any[];
  if (!row) throw notFound("Leave request not found");
  return row;
}
const reprocess = async (companyId: string, employeeId: string, from: string, to: string) => { const { addDays } = await import("../attendance/processor.js"); for (let d = from; d <= to; d = addDays(d, 1)) await processEmployeeDay(companyId, employeeId, d); };

r.post("/requests/:id/approve", validate(z.object({ note: z.string().optional() })), asyncHandler(async (req, res) => {
  const lr = await loadReq(req, req.params.id);
  const e = await me(req); const isHR = hasPermission(req, "leave.approve");
  const isManager = !!e && lr.reportingManagerId === e.id;
  if (!["pending", "manager_approved"].includes(lr.status)) throw conflict("Request already decided");
  if (lr.employeeId === e?.id && !isHR) throw forbidden("You cannot approve your own leave");
  if (lr.status === "pending" && !isManager && !isHR) throw forbidden("Only the reporting manager or HR can approve");
  if (lr.status === "manager_approved" && !isHR) throw forbidden("HR approval required at this level");
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, req.user!.id)).limit(1); const u_name = u.name;
  const level = lr.status === "pending" ? 1 : 2;
  const approvals = [...lr.approvals, { level, by: req.user!.id, byName: u.name, action: "approved", note: (req.body as any).note, at: new Date().toISOString() }];
  // Manager approval advances one level; HR (leave.approve) approval is always final.
  const final = isHR || level >= lr.approvalLevels;
  const status = final ? "approved" : "manager_approved";
  const [row] = await db.update(leaveRequests).set({ status, currentLevel: level + 1, approvals, updatedAt: new Date() }).where(eq(leaveRequests.id, lr.id)).returning();
  if (status === "approved") {
    if (lr.typeKind === "leave") await credit(lr.companyId, lr.employeeId, lr.leaveTypeId, yearOf(lr.fromDate), num(lr.days), "used", "used", `${lr.typeCode} ${lr.fromDate}→${lr.toDate}`, req.user!.id, lr.id);
    await reprocess(lr.companyId, lr.employeeId, lr.fromDate, lr.toDate);
    emitToCompany(lr.companyId, "leave:approved", { id: lr.id, employeeId: lr.employeeId });
    { const u = await userOfEmployee(lr.employeeId); if (u?.userId) await notify({ companyId: lr.companyId, userIds: [u.userId], type: "leave.approved", title: "Leave approved", body: `${lr.typeName} ${lr.fromDate}${lr.toDate !== lr.fromDate ? " to " + lr.toDate : ""} approved by ${u_name}`, link: "/app/leaves", priority: "success" }); }
    emitEvent("leave.approved", { companyId: lr.companyId, employeeId: lr.employeeId, days: num(lr.days), typeCode: lr.typeCode });
  }
  audit(req, "approve", "leave_request", lr.id, { level, status }); ok(res, row, status === "approved" ? "Leave approved" : "Approved — pending HR approval");
}));
r.post("/requests/:id/reject", validate(z.object({ reason: z.string().min(2) })), asyncHandler(async (req, res) => {
  const lr = await loadReq(req, req.params.id);
  const e = await me(req); const isHR = hasPermission(req, "leave.approve"); const isManager = !!e && lr.reportingManagerId === e.id;
  if (!["pending", "manager_approved"].includes(lr.status)) throw conflict("Request already decided");
  if (!isManager && !isHR) throw forbidden("Only the reporting manager or HR can reject");
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, req.user!.id)).limit(1);
  const reason = (req.body as any).reason;
  const [row] = await db.update(leaveRequests).set({ status: "rejected", rejectionReason: reason, approvals: [...lr.approvals, { level: lr.status === "pending" ? 1 : 2, by: req.user!.id, byName: u.name, action: "rejected", note: reason, at: new Date().toISOString() }], updatedAt: new Date() }).where(eq(leaveRequests.id, lr.id)).returning();
  emitToCompany(lr.companyId, "leave:rejected", { id: lr.id, employeeId: lr.employeeId, reason });
  { const uu = await userOfEmployee(lr.employeeId); if (uu?.userId) await notify({ companyId: lr.companyId, userIds: [uu.userId], type: "leave.rejected", title: "Leave rejected", body: `${lr.typeName} ${lr.fromDate}: ${reason}`, link: "/app/leaves", priority: "warning" }); }
  audit(req, "reject", "leave_request", lr.id, { reason }); ok(res, row, "Leave rejected");
}));
r.post("/requests/:id/cancel", asyncHandler(async (req, res) => {
  const lr = await loadReq(req, req.params.id);
  const e = await me(req); const isHR = hasPermission(req, "leave.approve");
  if (lr.employeeId !== e?.id && !isHR) throw forbidden("You can only cancel your own leave");
  if (!["pending", "manager_approved", "approved"].includes(lr.status)) throw conflict("Cannot cancel this request");
  if (lr.status === "approved" && lr.toDate < new Date().toISOString().slice(0, 10) && !isHR) throw badRequest("Past leave can only be cancelled by HR");
  const [row] = await db.update(leaveRequests).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(leaveRequests.id, lr.id)).returning();
  if (lr.status === "approved") {
    if (lr.typeKind === "leave") await credit(lr.companyId, lr.employeeId, lr.leaveTypeId, yearOf(lr.fromDate), -num(lr.days), "reverted", "used", `Cancelled ${lr.typeCode} ${lr.fromDate}→${lr.toDate}`, req.user!.id, lr.id);
    await reprocess(lr.companyId, lr.employeeId, lr.fromDate, lr.toDate);
  }
  audit(req, "cancel", "leave_request", lr.id); ok(res, row, "Leave cancelled");
}));
// Preview working days before applying
r.get("/working-days", asyncHandler(async (req, res) => {
  const e = (req.query.employeeId && hasPermission(req, "leave.approve")) ? (await db.select().from(employees).where(and(eq(employees.id, String(req.query.employeeId)), eq(employees.companyId, req.tenant!.companyId))).limit(1))[0] : await me(req);
  if (!e) throw badRequest("Employee not found");
  ok(res, await workingDays(e.companyId, e.id, e.branchId, dateRe.parse(req.query.from), dateRe.parse(req.query.to), req.query.halfDay ? String(req.query.halfDay) : null));
}));
void leaveBalances;
export default r;
