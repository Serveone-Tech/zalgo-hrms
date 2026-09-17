import { Router } from "express";
import { z } from "zod";
import { and, eq, desc, or, isNull, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { announcements, employees, holidays, leaveRequests, leaveTypes, interviews, candidates } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission, hasPermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { fullName } from "../employees/employees.service.js";
import { myEmployee, userName } from "../../common/me.js";
import { emitToCompany } from "../../sockets.js";
import { notify } from "../notifications/notify.service.js";
import { users } from "../../db/schema.js";
import { addDays } from "../attendance/processor.js";

const r = Router();
r.use(requireAuth, requireTenant);
const cid = (req: any) => req.tenant!.companyId as string;
const schema = z.object({ title: z.string().min(2).max(200), body: z.string().min(1), targetType: z.enum(["company", "branch", "department", "employees"]).default("company"), targetIds: z.array(z.string().uuid()).default([]), priority: z.enum(["info", "success", "warning", "critical"]).default("info"), eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(), publishAt: z.coerce.date().optional(), expiresAt: z.coerce.date().optional().nullable(), isPinned: z.boolean().default(false) });

r.get("/", asyncHandler(async (req, res) => {
  const e = await myEmployee(req); const now = new Date();
  const rows = await db.select().from(announcements).where(and(eq(announcements.companyId, cid(req)), lte(announcements.publishAt, now), or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now)))).orderBy(desc(announcements.isPinned), desc(announcements.publishAt)).limit(100);
  ok(res, rows.filter((a) => a.targetType === "company" || hasPermission(req, "announcement.manage") || (e && ((a.targetType === "branch" && a.targetIds.includes(e.branchId)) || (a.targetType === "department" && !!e.departmentId && a.targetIds.includes(e.departmentId)) || (a.targetType === "employees" && a.targetIds.includes(e.id))))));
}));
r.get("/all", requirePermission("announcement.manage"), asyncHandler(async (req, res) => { ok(res, await db.select().from(announcements).where(eq(announcements.companyId, cid(req))).orderBy(desc(announcements.createdAt)).limit(200)); }));
r.post("/", requirePermission("announcement.manage"), validate(schema), asyncHandler(async (req, res) => {
  const [row] = await db.insert(announcements).values({ ...(req.body as any), companyId: cid(req), createdBy: req.user!.id, createdByName: await userName(req) }).returning();
  emitToCompany(cid(req), "announcement:new", { id: row.id, title: row.title, priority: row.priority });
  { let q = db.select({ userId: users.id }).from(users).where(and(eq(users.companyId, cid(req)), eq(users.isActive, true))).$dynamic(); const us = await q; let ids = us.map((x) => x.userId); if (row.targetType !== "company") { const es = await db.select({ userId: employees.userId, branchId: employees.branchId, departmentId: employees.departmentId, id: employees.id }).from(employees).where(eq(employees.companyId, cid(req))); ids = es.filter((e) => e.userId && ((row.targetType === "branch" && row.targetIds.includes(e.branchId)) || (row.targetType === "department" && !!e.departmentId && row.targetIds.includes(e.departmentId)) || (row.targetType === "employees" && row.targetIds.includes(e.id)))).map((e) => e.userId!); } await notify({ companyId: cid(req), userIds: ids, type: "announcement.new", title: row.title, body: row.body.slice(0, 300), link: "/app/announcements", priority: row.priority as any }); }
  audit(req, "create", "announcement", row.id, { title: row.title }); created(res, row, "Announcement published");
}));
r.put("/:id", requirePermission("announcement.manage"), validate(schema.partial()), asyncHandler(async (req, res) => {
  const [row] = await db.update(announcements).set({ ...(req.body as any), updatedAt: new Date() }).where(and(eq(announcements.id, req.params.id), eq(announcements.companyId, cid(req)))).returning();
  if (!row) throw notFound("Announcement not found"); audit(req, "update", "announcement", row.id); ok(res, row, "Updated");
}));
r.delete("/:id", requirePermission("announcement.manage"), asyncHandler(async (req, res) => { const [row] = await db.delete(announcements).where(and(eq(announcements.id, req.params.id), eq(announcements.companyId, cid(req)))).returning(); if (!row) throw notFound("Not found"); audit(req, "delete", "announcement", row.id); ok(res, null, "Deleted"); }));

// Calendar (Section 97)
r.get("/calendar", asyncHandler(async (req, res) => {
  const dre = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); const from = dre.parse(req.query.from); const to = dre.parse(req.query.to);
  const e = await myEmployee(req); const c = cid(req);
  const hols = await db.select().from(holidays).where(and(eq(holidays.companyId, c), gte(holidays.date, from), lte(holidays.date, to), or(isNull(holidays.branchId), e ? eq(holidays.branchId, e.branchId) : undefined)));
  const scopeBranch = e && !hasPermission(req, "leave.view") ? eq(employees.branchId, e.branchId) : undefined;
  const lv = await db.select({ employeeName: fullName, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, code: leaveTypes.code, halfDay: leaveRequests.halfDay }).from(leaveRequests).innerJoin(employees, eq(employees.id, leaveRequests.employeeId)).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId)).where(and(eq(leaveRequests.companyId, c), eq(leaveRequests.status, "approved"), lte(leaveRequests.fromDate, to), gte(leaveRequests.toDate, from), scopeBranch));
  const ppl = await db.select({ name: fullName, dob: employees.dateOfBirth, doj: employees.joiningDate }).from(employees).where(and(eq(employees.companyId, c), sql`${employees.status} not in ('resigned','terminated','inactive')`, scopeBranch));
  const inRange = (d: Date | null, y: number) => { if (!d) return null; const s = `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; return s >= from && s <= to ? s : null; };
  const years = [...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])];
  const events: { date: string; type: string; title: string; sub?: string }[] = [];
  for (const h of hols) events.push({ date: h.date, type: "holiday", title: h.name, sub: h.isOptional ? "optional" : undefined });
  for (const l of lv) for (let d = l.fromDate < from ? from : l.fromDate; d <= (l.toDate > to ? to : l.toDate); d = addDays(d, 1)) events.push({ date: d, type: "leave", title: l.employeeName, sub: l.code + (l.halfDay ? " ½" : "") });
  for (const p of ppl) for (const y of years) { const b = inRange(p.dob, y); if (b) events.push({ date: b, type: "birthday", title: p.name }); const a = inRange(p.doj, y); if (a && y > p.doj.getUTCFullYear()) events.push({ date: a, type: "anniversary", title: p.name, sub: `${y - p.doj.getUTCFullYear()} yr` }); }
  if (hasPermission(req, "recruitment.view")) { const iv = await db.select({ at: interviews.scheduledAt, name: candidates.name, type: interviews.type }).from(interviews).innerJoin(candidates, eq(candidates.id, interviews.candidateId)).where(and(eq(interviews.companyId, c), eq(interviews.status, "scheduled"), gte(interviews.scheduledAt, new Date(from)), lte(interviews.scheduledAt, new Date(to + "T23:59:59Z")))); for (const i of iv) events.push({ date: i.at.toISOString().slice(0, 10), type: "interview", title: i.name, sub: `${i.type} ${i.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}` }); }
  const ann = await db.select().from(announcements).where(and(eq(announcements.companyId, c), gte(announcements.eventDate, from), lte(announcements.eventDate, to)));
  for (const a of ann) events.push({ date: a.eventDate!, type: "event", title: a.title });
  ok(res, events.sort((x, y) => x.date.localeCompare(y.date)));
}));
export default r;
