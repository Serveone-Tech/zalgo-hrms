import { Router } from "express";
import { z } from "zod";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { expenses, expenseCategories, employees, departments } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, badRequest, forbidden, conflict } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule, hasPermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { employeeScopeWhere } from "../../common/scope.js";
import { fullName } from "../employees/employees.service.js";
import { myEmployee, userName } from "../../common/me.js";
import { emitToCompany } from "../../sockets.js";
import { notify, managerUser, userOfEmployee } from "../notifications/notify.service.js";
import { emitEvent } from "../automation/engine.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("expenses"));
const cid = (req: any) => req.tenant!.companyId as string;

r.get("/categories", asyncHandler(async (req, res) => { ok(res, await db.select().from(expenseCategories).where(eq(expenseCategories.companyId, cid(req))).orderBy(expenseCategories.name)); }));
r.post("/categories", requirePermission("expense.approve"), validate(z.object({ name: z.string().min(2), maxAmount: z.coerce.number().min(0).optional().nullable(), requiresReceipt: z.boolean().default(true) })), asyncHandler(async (req, res) => {
  const b = req.body as any; const [row] = await db.insert(expenseCategories).values({ ...b, maxAmount: b.maxAmount != null ? String(b.maxAmount) : null, companyId: cid(req) }).returning();
  audit(req, "create", "expense_category", row.id, { name: row.name }); created(res, row, "Category created");
}));
r.post("/categories/seed-defaults", requirePermission("expense.approve"), asyncHandler(async (req, res) => {
  let n = 0; for (const name of ["Travel", "Food", "Fuel", "Hotel", "Office Expense", "Other"]) { const [d] = await db.select().from(expenseCategories).where(and(eq(expenseCategories.companyId, cid(req)), eq(expenseCategories.name, name))).limit(1); if (!d) { await db.insert(expenseCategories).values({ companyId: cid(req), name, requiresReceipt: name !== "Other" }); n++; } }
  ok(res, { created: n }, `${n} categories created`);
}));
r.put("/categories/:id", requirePermission("expense.approve"), validate(z.object({ name: z.string().min(2).optional(), maxAmount: z.coerce.number().min(0).optional().nullable(), requiresReceipt: z.boolean().optional(), isActive: z.boolean().optional() })), asyncHandler(async (req, res) => {
  const b = req.body as any; const patch: any = { ...b }; if (b.maxAmount !== undefined) patch.maxAmount = b.maxAmount != null ? String(b.maxAmount) : null;
  const [row] = await db.update(expenseCategories).set(patch).where(and(eq(expenseCategories.id, req.params.id), eq(expenseCategories.companyId, cid(req)))).returning();
  if (!row) throw notFound("Category not found"); ok(res, row, "Category updated");
}));

const withNames = (where: any) => db.select({ ...expenses as any, employeeName: fullName, employeeCode: employees.employeeCode, departmentName: departments.name, categoryName: expenseCategories.name, reportingManagerId: employees.reportingManagerId }).from(expenses).innerJoin(employees, eq(employees.id, expenses.employeeId)).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId)).where(where).orderBy(desc(expenses.createdAt)).limit(500);
const submitSchema = z.object({ categoryId: z.string().uuid().optional().nullable(), title: z.string().min(2).max(150), description: z.string().optional(), amount: z.coerce.number().positive(), expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), receiptUrl: z.string().url().optional().or(z.literal("")).nullable() });

r.post("/", requirePermission("expense.submit"), validate(submitSchema), asyncHandler(async (req, res) => {
  const e = await myEmployee(req); if (!e) throw badRequest("Your login is not linked to an employee record");
  const b = req.body as z.infer<typeof submitSchema>;
  if (b.categoryId) { const [c] = await db.select().from(expenseCategories).where(and(eq(expenseCategories.id, b.categoryId), eq(expenseCategories.companyId, cid(req)))).limit(1); if (!c) throw badRequest("Invalid category"); if (c.maxAmount && b.amount > Number(c.maxAmount)) throw badRequest(`${c.name} is capped at ₹${Number(c.maxAmount)}`); if (c.requiresReceipt && !b.receiptUrl) throw badRequest(`${c.name} requires a receipt link`); }
  const [row] = await db.insert(expenses).values({ ...b, amount: String(b.amount), receiptUrl: b.receiptUrl || null, companyId: cid(req), branchId: e.branchId, employeeId: e.id }).returning();
  emitToCompany(cid(req), "expense:submitted", { id: row.id, employeeId: e.id, managerId: e.reportingManagerId, amount: b.amount });
  { const m = await managerUser(e.id); if (m) await notify({ companyId: cid(req), userIds: [m], type: "expense.submitted", title: `Expense claim: ${e.firstName} ${e.lastName}`, body: `${b.title} — ₹${b.amount}`, link: "/app/expenses" }); }
  emitEvent("expense.submitted", { companyId: cid(req), employeeId: e.id, amount: b.amount });
  audit(req, "submit", "expense", row.id, { amount: b.amount }); created(res, row, "Expense submitted");
}));
r.get("/me", asyncHandler(async (req, res) => { const e = await myEmployee(req); if (!e) return ok(res, []); ok(res, await withNames(eq(expenses.employeeId, e.id))); }));
r.get("/pending", asyncHandler(async (req, res) => {
  const e = await myEmployee(req); const conds: any[] = [];
  if (e) conds.push(and(eq(expenses.status, "pending"), eq(employees.reportingManagerId, e.id)));
  if (hasPermission(req, "expense.approve")) conds.push(and(await employeeScopeWhere(req, employees), inArray(expenses.status, ["pending", "manager_approved"])));
  if (hasPermission(req, "expense.pay")) conds.push(and(eq(expenses.companyId, cid(req)), eq(expenses.status, "approved")));
  if (!conds.length) return ok(res, []);
  ok(res, await withNames(sql.join(conds.map((c) => sql`(${c})`), sql` or `)));
}));
r.get("/", requirePermission("expense.view"), asyncHandler(async (req, res) => { const status = req.query.status as string | undefined; ok(res, await withNames(and(await employeeScopeWhere(req, employees), status ? eq(expenses.status, status) : undefined))); }));
async function load(req: any, id: string) { const [row] = await withNames(and(eq(expenses.id, id), eq(expenses.companyId, cid(req)))) as any[]; if (!row) throw notFound("Expense not found"); return row; }
r.post("/:id/approve", validate(z.object({ note: z.string().optional() })), asyncHandler(async (req, res) => {
  const x = await load(req, req.params.id); const e = await myEmployee(req); const isApprover = hasPermission(req, "expense.approve"); const isManager = !!e && x.reportingManagerId === e.id;
  if (!["pending", "manager_approved"].includes(x.status)) throw conflict("Already decided");
  if (x.employeeId === e?.id && !isApprover) throw forbidden("Cannot approve your own expense");
  if (x.status === "pending" && !isManager && !isApprover) throw forbidden("Only the reporting manager or accounts can approve");
  if (x.status === "manager_approved" && !isApprover) throw forbidden("Accounts approval required");
  const level = x.status === "pending" ? 1 : 2; const status = isApprover ? "approved" : "manager_approved";
  const [row] = await db.update(expenses).set({ status, approvals: [...x.approvals, { level, by: req.user!.id, byName: await userName(req), action: "approved", note: (req.body as any).note, at: new Date().toISOString() }], updatedAt: new Date() }).where(eq(expenses.id, x.id)).returning();
  emitToCompany(cid(req), "expense:updated", { id: x.id, employeeId: x.employeeId, status });
  { const u = await userOfEmployee(x.employeeId); if (u?.userId) await notify({ companyId: cid(req), userIds: [u.userId], type: "expense.updated", title: `Expense ${status === "approved" ? "approved" : "manager approved"}`, body: `${x.title} — ₹${Number(x.amount)}`, link: "/app/expenses", priority: "success" }); }
  audit(req, "approve", "expense", x.id, { status }); ok(res, row, status === "approved" ? "Expense approved — ready to pay" : "Approved — pending accounts");
}));
r.post("/:id/reject", validate(z.object({ reason: z.string().min(2) })), asyncHandler(async (req, res) => {
  const x = await load(req, req.params.id); const e = await myEmployee(req); const isApprover = hasPermission(req, "expense.approve"); const isManager = !!e && x.reportingManagerId === e.id;
  if (!["pending", "manager_approved"].includes(x.status)) throw conflict("Already decided"); if (!isManager && !isApprover) throw forbidden();
  const reason = (req.body as any).reason;
  const [row] = await db.update(expenses).set({ status: "rejected", rejectionReason: reason, approvals: [...x.approvals, { level: x.status === "pending" ? 1 : 2, by: req.user!.id, byName: await userName(req), action: "rejected", note: reason, at: new Date().toISOString() }], updatedAt: new Date() }).where(eq(expenses.id, x.id)).returning();
  emitToCompany(cid(req), "expense:updated", { id: x.id, employeeId: x.employeeId, status: "rejected", reason });
  { const u = await userOfEmployee(x.employeeId); if (u?.userId) await notify({ companyId: cid(req), userIds: [u.userId], type: "expense.updated", title: "Expense rejected", body: `${x.title}: ${reason}`, link: "/app/expenses", priority: "warning" }); }
  audit(req, "reject", "expense", x.id, { reason }); ok(res, row, "Expense rejected");
}));
r.post("/:id/pay", requirePermission("expense.pay"), validate(z.object({ paidRef: z.string().max(80).optional() })), asyncHandler(async (req, res) => {
  const x = await load(req, req.params.id); if (x.status !== "approved") throw conflict("Only approved expenses can be paid");
  const [row] = await db.update(expenses).set({ status: "paid", paidAt: new Date(), paidRef: (req.body as any).paidRef, updatedAt: new Date() }).where(eq(expenses.id, x.id)).returning();
  emitToCompany(cid(req), "expense:updated", { id: x.id, employeeId: x.employeeId, status: "paid" });
  { const u = await userOfEmployee(x.employeeId); if (u?.userId) await notify({ companyId: cid(req), userIds: [u.userId], type: "expense.updated", title: "Expense reimbursed", body: `${x.title} — ₹${Number(x.amount)} paid`, link: "/app/expenses", priority: "success" }); }
  audit(req, "pay", "expense", x.id, { amount: x.amount }); ok(res, row, "Marked paid");
}));
r.delete("/:id", asyncHandler(async (req, res) => {
  const x = await load(req, req.params.id); const e = await myEmployee(req);
  if (!(x.employeeId === e?.id && x.status === "pending") && !hasPermission(req, "expense.approve")) throw forbidden();
  if (x.status === "paid") throw conflict("Paid expenses cannot be deleted");
  await db.delete(expenses).where(eq(expenses.id, x.id)); audit(req, "delete", "expense", x.id); ok(res, null, "Expense withdrawn");
}));
export default r;
