import { Router } from "express";
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { performanceGoals, reviewCycles, performanceReviews, employees, designations, departments } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, badRequest, forbidden, conflict } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule, hasPermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { employeeScopeWhere } from "../../common/scope.js";
import { fullName } from "../employees/employees.service.js";
import { myEmployee } from "../../common/me.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("performance"));
const cid = (req: any) => req.tenant!.companyId as string;
const isHR = (req: any) => hasPermission(req, "performance.manage") && req.user.scope === "company";

// ---- Goals / KPI / OKR (84) ----
const goalSchema = z.object({ employeeId: z.string().uuid().optional(), cycleId: z.string().uuid().optional().nullable(), title: z.string().min(2).max(200), description: z.string().optional().nullable(), type: z.enum(["goal", "kpi", "okr"]).default("goal"), targetValue: z.coerce.number().optional().nullable(), currentValue: z.coerce.number().optional().nullable(), unit: z.string().max(20).optional().nullable(), weight: z.coerce.number().int().min(1).max(10).default(1), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable() });
const goalRow = (b: any) => { const o: any = { ...b }; if (o.targetValue != null) o.targetValue = String(o.targetValue); if (o.currentValue != null) o.currentValue = String(o.currentValue); return o; };
const progressOf = (cur: any, tgt: any, fallback: number) => (tgt && Number(tgt) > 0 ? Math.min(100, Math.round((Number(cur ?? 0) / Number(tgt)) * 100)) : fallback);
r.get("/goals", asyncHandler(async (req, res) => {
  const me = await myEmployee(req); const employeeId = (req.query.employeeId as string) || me?.id;
  if (!employeeId) return ok(res, []);
  if (employeeId !== me?.id) { const scope = await employeeScopeWhere(req, employees); const [e] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), scope)).limit(1); if (!e) throw forbidden(); }
  ok(res, await db.select().from(performanceGoals).where(and(eq(performanceGoals.companyId, cid(req)), eq(performanceGoals.employeeId, employeeId))).orderBy(desc(performanceGoals.createdAt)));
}));
r.post("/goals", validate(goalSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof goalSchema>; const me = await myEmployee(req);
  const employeeId = b.employeeId ?? me?.id; if (!employeeId) throw badRequest("Employee required");
  if (employeeId !== me?.id) { if (!hasPermission(req, "performance.manage")) throw forbidden(); const scope = await employeeScopeWhere(req, employees); const [e] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), scope)).limit(1); if (!e) throw forbidden(); }
  const [row] = await db.insert(performanceGoals).values({ ...goalRow(b), employeeId, companyId: cid(req), progress: progressOf(b.currentValue, b.targetValue, 0), createdBy: req.user!.id }).returning();
  audit(req, "create", "goal", row.id, { title: row.title }); created(res, row, "Goal created");
}));
r.put("/goals/:id", validate(goalSchema.partial().extend({ progress: z.coerce.number().int().min(0).max(100).optional(), status: z.enum(["active", "completed", "cancelled"]).optional() })), asyncHandler(async (req, res) => {
  const [g] = await db.select().from(performanceGoals).where(and(eq(performanceGoals.id, req.params.id), eq(performanceGoals.companyId, cid(req)))).limit(1); if (!g) throw notFound("Goal not found");
  const me = await myEmployee(req); if (g.employeeId !== me?.id && !hasPermission(req, "performance.manage")) throw forbidden();
  const b = req.body as any; const patch = { ...goalRow(b), updatedAt: new Date() };
  const cur = b.currentValue ?? g.currentValue, tgt = b.targetValue ?? g.targetValue; patch.progress = b.progress ?? progressOf(cur, tgt, g.progress);
  if (patch.progress >= 100 && !b.status) patch.status = "completed";
  const [row] = await db.update(performanceGoals).set(patch).where(eq(performanceGoals.id, g.id)).returning(); ok(res, row, "Goal updated");
}));
r.delete("/goals/:id", asyncHandler(async (req, res) => { const [g] = await db.select().from(performanceGoals).where(and(eq(performanceGoals.id, req.params.id), eq(performanceGoals.companyId, cid(req)))).limit(1); if (!g) throw notFound("Goal not found"); const me = await myEmployee(req); if (g.employeeId !== me?.id && !hasPermission(req, "performance.manage")) throw forbidden(); await db.delete(performanceGoals).where(eq(performanceGoals.id, g.id)); ok(res, null, "Goal deleted"); }));

// ---- Review cycles & appraisal (85) ----
r.get("/cycles", asyncHandler(async (req, res) => { ok(res, await db.select({ ...reviewCycles as any, reviewCount: sql<number>`(select count(*) from ${performanceReviews} where ${performanceReviews.cycleId} = ${reviewCycles.id})`.mapWith(Number), completed: sql<number>`(select count(*) from ${performanceReviews} where ${performanceReviews.cycleId} = ${reviewCycles.id} and ${performanceReviews.status} = 'completed')`.mapWith(Number) }).from(reviewCycles).where(eq(reviewCycles.companyId, cid(req))).orderBy(desc(reviewCycles.periodEnd))); }));
r.post("/cycles", requirePermission("performance.manage"), validate(z.object({ name: z.string().min(2), periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ratingScale: z.coerce.number().int().min(3).max(10).default(5), includeAll: z.boolean().default(true) })), asyncHandler(async (req, res) => {
  const b = req.body as any; const [cycle] = await db.insert(reviewCycles).values({ name: b.name, periodStart: b.periodStart, periodEnd: b.periodEnd, ratingScale: b.ratingScale, companyId: cid(req) }).returning();
  let n = 0;
  if (b.includeAll) { const emps = await db.select({ id: employees.id, mgr: employees.reportingManagerId }).from(employees).where(and(eq(employees.companyId, cid(req)), sql`${employees.status} in ('active','probation','notice_period')`)); for (const e of emps) { await db.insert(performanceReviews).values({ companyId: cid(req), cycleId: cycle.id, employeeId: e.id, managerId: e.mgr }).onConflictDoNothing(); n++; } }
  audit(req, "create", "review_cycle", cycle.id, { name: cycle.name, reviews: n }); created(res, cycle, `Cycle created with ${n} reviews`);
}));
r.post("/cycles/:id/status", requirePermission("performance.manage"), validate(z.object({ status: z.enum(["draft", "open", "closed"]) })), asyncHandler(async (req, res) => { const [row] = await db.update(reviewCycles).set({ status: (req.body as any).status, updatedAt: new Date() }).where(and(eq(reviewCycles.id, req.params.id), eq(reviewCycles.companyId, cid(req)))).returning(); if (!row) throw notFound("Cycle not found"); ok(res, row, `Cycle ${row.status}`); }));
const reviewsQ = (where: any) => db.select({ ...performanceReviews as any, employeeName: fullName, employeeCode: employees.employeeCode, designationName: designations.name, departmentName: departments.name, cycleName: reviewCycles.name, ratingScale: reviewCycles.ratingScale, cycleStatus: reviewCycles.status }).from(performanceReviews).innerJoin(employees, eq(employees.id, performanceReviews.employeeId)).innerJoin(reviewCycles, eq(reviewCycles.id, performanceReviews.cycleId)).leftJoin(designations, eq(designations.id, employees.designationId)).leftJoin(departments, eq(departments.id, employees.departmentId)).where(where).orderBy(employees.employeeCode);
r.get("/reviews/me", asyncHandler(async (req, res) => { const me = await myEmployee(req); if (!me) return ok(res, []); ok(res, await reviewsQ(eq(performanceReviews.employeeId, me.id))); }));
r.get("/reviews/team", asyncHandler(async (req, res) => { const me = await myEmployee(req); if (!me) return ok(res, []); ok(res, await reviewsQ(and(eq(performanceReviews.managerId, me.id), eq(reviewCycles.status, "open")))); }));
r.get("/cycles/:id/reviews", requirePermission("performance.manage"), asyncHandler(async (req, res) => { ok(res, await reviewsQ(and(eq(performanceReviews.cycleId, req.params.id), eq(performanceReviews.companyId, cid(req)), await employeeScopeWhere(req, employees)))); }));
r.post("/reviews/:id/self", validate(z.object({ rating: z.coerce.number().int().min(1), comments: z.string().min(1) })), asyncHandler(async (req, res) => {
  const [[rv], me] = await Promise.all([db.select().from(performanceReviews).where(and(eq(performanceReviews.id, req.params.id), eq(performanceReviews.companyId, cid(req)))).limit(1), myEmployee(req)]);
  if (!rv) throw notFound("Review not found"); if (rv.employeeId !== me?.id) throw forbidden("Not your review"); if (rv.status !== "self_pending") throw conflict("Self review already submitted");
  const b = req.body as any; const [row] = await db.update(performanceReviews).set({ selfRating: b.rating, selfComments: b.comments, selfSubmittedAt: new Date(), status: "manager_pending", updatedAt: new Date() }).where(eq(performanceReviews.id, rv.id)).returning(); ok(res, row, "Self review submitted");
}));
r.post("/reviews/:id/manager", validate(z.object({ rating: z.coerce.number().int().min(1), comments: z.string().min(1) })), asyncHandler(async (req, res) => {
  const [[rv], me] = await Promise.all([db.select().from(performanceReviews).where(and(eq(performanceReviews.id, req.params.id), eq(performanceReviews.companyId, cid(req)))).limit(1), myEmployee(req)]);
  if (!rv) throw notFound("Review not found"); if (rv.managerId !== me?.id && !isHR(req)) throw forbidden("Only the reporting manager can review"); if (!["self_pending", "manager_pending"].includes(rv.status)) throw conflict("Manager review already submitted");
  const b = req.body as any; const [row] = await db.update(performanceReviews).set({ managerRating: b.rating, managerComments: b.comments, managerSubmittedAt: new Date(), status: "hr_pending", updatedAt: new Date() }).where(eq(performanceReviews.id, rv.id)).returning(); ok(res, row, "Manager review submitted");
}));
r.post("/reviews/:id/hr", requirePermission("performance.manage"), validate(z.object({ rating: z.coerce.number().int().min(1).optional().nullable(), comments: z.string().optional(), finalRating: z.coerce.number().min(0).optional() })), asyncHandler(async (req, res) => {
  const [rv] = await db.select().from(performanceReviews).where(and(eq(performanceReviews.id, req.params.id), eq(performanceReviews.companyId, cid(req)))).limit(1); if (!rv) throw notFound("Review not found");
  const b = req.body as any; const parts = [rv.managerRating, b.rating ?? rv.hrRating].filter((x) => x != null) as number[];
  const finalRating = b.finalRating ?? (parts.length ? Math.round((parts.reduce((a, x) => a + x, 0) / parts.length) * 10) / 10 : null);
  const [row] = await db.update(performanceReviews).set({ hrRating: b.rating ?? null, hrComments: b.comments, hrSubmittedAt: new Date(), finalRating: finalRating != null ? String(finalRating) : null, status: "completed", updatedAt: new Date() }).where(eq(performanceReviews.id, rv.id)).returning();
  audit(req, "finalize", "performance_review", rv.id, { finalRating }); ok(res, row, "Review finalised");
}));
export default r;
