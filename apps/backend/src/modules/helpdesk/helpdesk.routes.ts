import { Router } from "express";
import { z } from "zod";
import { and, eq, desc, count } from "drizzle-orm";
import { db } from "../../db/index.js";
import { tickets, employees, users } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, badRequest, forbidden } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule, hasPermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { fullName } from "../employees/employees.service.js";
import { myEmployee, userName } from "../../common/me.js";
import { emitToCompany } from "../../sockets.js";
import { notify, usersWithPermission, userOfEmployee } from "../notifications/notify.service.js";
import { emitEvent } from "../automation/engine.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("helpdesk"));
const cid = (req: any) => req.tenant!.companyId as string;
const withNames = (where: any) => db.select({ ...tickets as any, employeeName: fullName, employeeCode: employees.employeeCode, assigneeName: users.name }).from(tickets).innerJoin(employees, eq(employees.id, tickets.employeeId)).leftJoin(users, eq(users.id, tickets.assignedTo)).where(where).orderBy(desc(tickets.createdAt)).limit(500);

r.post("/", validate(z.object({ category: z.enum(["hr", "it", "accounts", "admin"]), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"), subject: z.string().min(3).max(200), description: z.string().optional() })), asyncHandler(async (req, res) => {
  const e = await myEmployee(req); if (!e) throw badRequest("Your login is not linked to an employee record");
  const [{ n }] = await db.select({ n: count() }).from(tickets).where(eq(tickets.companyId, cid(req)));
  const [row] = await db.insert(tickets).values({ ...(req.body as any), companyId: cid(req), employeeId: e.id, number: n + 1 }).returning();
  emitToCompany(cid(req), "ticket:created", { id: row.id, number: row.number, category: row.category, subject: row.subject });
  await notify({ companyId: cid(req), userIds: await usersWithPermission(cid(req), "helpdesk.manage"), type: "ticket.created", title: `Ticket #${row.number} (${row.category.toUpperCase()}): ${row.subject}`, body: row.description ?? undefined, link: "/app/helpdesk", priority: row.priority === "urgent" ? "critical" : "info" });
  emitEvent("ticket.created", { companyId: cid(req), employeeId: e.id, category: row.category, priority: row.priority });
  audit(req, "create", "ticket", row.id, { number: row.number }); created(res, row, `Ticket #${row.number} raised`);
}));
r.get("/me", asyncHandler(async (req, res) => { const e = await myEmployee(req); if (!e) return ok(res, []); ok(res, await withNames(eq(tickets.employeeId, e.id))); }));
r.get("/", requirePermission("helpdesk.manage"), asyncHandler(async (req, res) => { const status = req.query.status as string | undefined; const category = req.query.category as string | undefined; ok(res, await withNames(and(eq(tickets.companyId, cid(req)), status ? eq(tickets.status, status) : undefined, category ? eq(tickets.category, category) : undefined))); }));
r.get("/agents", requirePermission("helpdesk.manage"), asyncHandler(async (req, res) => { ok(res, await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.companyId, cid(req)), eq(users.isActive, true))).orderBy(users.name)); }));
async function load(req: any, id: string) { const [t] = await withNames(and(eq(tickets.id, id), eq(tickets.companyId, cid(req)))) as any[]; if (!t) throw notFound("Ticket not found"); const e = await myEmployee(req); if (t.employeeId !== e?.id && !hasPermission(req, "helpdesk.manage")) throw forbidden(); return t; }
r.get("/:id", asyncHandler(async (req, res) => { const t = await load(req, req.params.id); if (!hasPermission(req, "helpdesk.manage")) t.comments = t.comments.filter((c: any) => !c.internal); ok(res, t); }));
r.post("/:id/comment", validate(z.object({ text: z.string().min(1).max(4000), internal: z.boolean().default(false) })), asyncHandler(async (req, res) => {
  const t = await load(req, req.params.id); const b = req.body as { text: string; internal: boolean };
  const comments = [...t.comments, { by: req.user!.id, byName: await userName(req), text: b.text, at: new Date().toISOString(), internal: b.internal && hasPermission(req, "helpdesk.manage") }];
  const [row] = await db.update(tickets).set({ comments, status: t.status === "resolved" && !hasPermission(req, "helpdesk.manage") ? "open" : t.status, updatedAt: new Date() }).where(eq(tickets.id, t.id)).returning();
  emitToCompany(cid(req), "ticket:updated", { id: t.id, number: t.number, employeeId: t.employeeId }); ok(res, row, "Comment added");
}));
r.post("/:id/update", requirePermission("helpdesk.manage"), validate(z.object({ status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(), assignedTo: z.string().uuid().optional().nullable(), priority: z.enum(["low", "normal", "high", "urgent"]).optional(), category: z.enum(["hr", "it", "accounts", "admin"]).optional() })), asyncHandler(async (req, res) => {
  const t = await load(req, req.params.id); const b = req.body as any;
  const [row] = await db.update(tickets).set({ ...b, resolvedAt: b.status === "resolved" ? new Date() : undefined, updatedAt: new Date() }).where(eq(tickets.id, t.id)).returning();
  emitToCompany(cid(req), "ticket:updated", { id: t.id, number: t.number, employeeId: t.employeeId, status: row.status });
  if (b.status) { const u = await userOfEmployee(t.employeeId); if (u?.userId) await notify({ companyId: cid(req), userIds: [u.userId], type: "ticket.updated", title: `Ticket #${t.number} ${row.status.replace("_", " ")}`, body: t.subject, link: "/app/helpdesk" }); }
  audit(req, "update", "ticket", t.id, b); ok(res, row, "Ticket updated");
}));
r.post("/:id/close", asyncHandler(async (req, res) => { const t = await load(req, req.params.id); const [row] = await db.update(tickets).set({ status: "closed", updatedAt: new Date() }).where(eq(tickets.id, t.id)).returning(); ok(res, row, "Ticket closed"); }));
export default r;
