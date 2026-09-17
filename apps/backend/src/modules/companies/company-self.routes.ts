import { Router } from "express";
import { z } from "zod";
import { eq, and, count } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, branches, users, branchRequests, subscriptions, subscriptionPlans, employees, employeeDocuments, attendance, devices, leaveRequests } from "../../db/schema.js";
import { ymd } from "../attendance/processor.js";
import { sql, lte, gte } from "drizzle-orm";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";

const r = Router();
r.use(requireAuth, requireTenant);

r.get("/dashboard", asyncHandler(async (req, res) => {
  const cid = req.tenant!.companyId;
  const [{ activeBranches }] = await db.select({ activeBranches: count() }).from(branches).where(and(eq(branches.companyId, cid), eq(branches.status, "active")));
  const [{ pendingBranches }] = await db.select({ pendingBranches: count() }).from(branchRequests).where(and(eq(branchRequests.companyId, cid), eq(branchRequests.status, "pending")));
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(users).where(eq(users.companyId, cid));
  const [sub] = await db.select({ status: subscriptions.status, endsAt: subscriptions.endsAt, employeeLimit: subscriptions.employeeLimit, branchLimit: subscriptions.branchLimit, deviceLimit: subscriptions.deviceLimit, plan: subscriptionPlans.name, modules: subscriptions.modules })
    .from(subscriptions).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId)).where(eq(subscriptions.companyId, cid)).limit(1);
  const [{ totalEmployees }] = await db.select({ totalEmployees: count() }).from(employees).where(and(eq(employees.companyId, cid), sql`${employees.status} not in ('resigned','terminated')`));
  const in30 = new Date(Date.now() + 30 * 86400000);
  const [{ expiringDocs }] = await db.select({ expiringDocs: count() }).from(employeeDocuments).where(and(eq(employeeDocuments.companyId, cid), lte(employeeDocuments.expiryDate, in30), gte(employeeDocuments.expiryDate, new Date())));
  const byDept = await db.select({ name: sql<string>`coalesce((select d.name from departments d where d.id = ${employees.departmentId}), 'Unassigned')`, n: count() }).from(employees).where(and(eq(employees.companyId, cid), sql`${employees.status} not in ('resigned','terminated')`)).groupBy(sql`1`);
  const [co] = await db.select({ tz: companies.timezone }).from(companies).where(eq(companies.id, cid)).limit(1);
  const today = ymd(new Date(), co?.tz ?? "Asia/Kolkata");
  const att = await db.select({ status: attendance.status, n: count() }).from(attendance).where(and(eq(attendance.companyId, cid), eq(attendance.date, today))).groupBy(attendance.status);
  const g = (...s: string[]) => att.filter((x) => s.includes(x.status)).reduce((a, x) => a + x.n, 0);
  const dev = await db.select({ status: devices.status, n: count() }).from(devices).where(eq(devices.companyId, cid)).groupBy(devices.status);
  const devicesOnline = dev.find((x) => x.status === "online")?.n ?? 0, devicesTotal = dev.reduce((a, x) => a + x.n, 0);
  const [{ pendingLeaves }] = await db.select({ pendingLeaves: count() }).from(leaveRequests).where(and(eq(leaveRequests.companyId, cid), sql`${leaveRequests.status} in ('pending','manager_approved')`));
  ok(res, { pendingLeaves, devicesOnline, devicesTotal, activeBranches, pendingBranches, totalUsers, totalEmployees, expiringDocs, byDepartment: byDept, presentToday: g("present", "late", "early_out", "work_from_home", "half_day"), absentToday: g("absent"), lateToday: g("late"), onLeaveToday: g("on_leave"), today, subscription: sub ?? null });
}));

r.get("/settings", requirePermission("company.view"), asyncHandler(async (req, res) => {
  const [c] = await db.select().from(companies).where(eq(companies.id, req.tenant!.companyId)).limit(1);
  ok(res, c);
}));
r.put("/settings", requirePermission("company.settings"), validate(z.object({
  logoUrl: z.string().url().optional().or(z.literal("")), address: z.string().optional(), timezone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")), mobile: z.string().optional(), website: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
})), asyncHandler(async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const [c] = await db.update(companies).set({ ...b, logoUrl: (b.logoUrl as string) || null, updatedAt: new Date() }).where(eq(companies.id, req.tenant!.companyId)).returning();
  audit(req, "update", "company_settings", c.id, b);
  ok(res, c, "Settings saved");
}));
export default r;
