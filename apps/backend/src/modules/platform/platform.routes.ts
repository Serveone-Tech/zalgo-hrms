import { Router } from "express";
import { eq, count, sql, and, lte, gte, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, branches, users, subscriptions, subscriptionPlans, branchRequests } from "../../db/schema.js";
import { asyncHandler } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { computeTotal } from "../subscriptions/subscription.service.js";

const r = Router();
r.use(requireAuth, requireSuperAdmin);

r.get("/dashboard", asyncHandler(async (_req, res) => {
  const byStatus = await db.select({ status: companies.status, n: count() }).from(companies).groupBy(companies.status);
  const [{ totalBranches }] = await db.select({ totalBranches: count() }).from(branches).where(eq(branches.status, "active"));
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(users).where(eq(users.type, "company_user"));
  const [{ pendingBranchRequests }] = await db.select({ pendingBranchRequests: count() }).from(branchRequests).where(eq(branchRequests.status, "pending"));
  const in7 = new Date(Date.now() + 7 * 86400000);
  const [{ expiringSoon }] = await db.select({ expiringSoon: count() }).from(subscriptions).where(and(lte(subscriptions.endsAt, in7), gte(subscriptions.endsAt, new Date())));
  const [{ expired }] = await db.select({ expired: count() }).from(subscriptions).where(lte(subscriptions.endsAt, new Date()));
  const subs = await db.select().from(subscriptions).where(sql`${subscriptions.status} in ('active','trial')`);
  const mrr = subs.reduce((a, s) => a + (s.status === "active" ? (s.billingCycle === "yearly" ? computeTotal(s) / 12 : computeTotal(s)) : 0), 0);
  const planDist = await db.select({ plan: subscriptionPlans.name, n: count() }).from(subscriptions).innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId)).groupBy(subscriptionPlans.name);
  const growth = await db.select({ month: sql<string>`to_char(date_trunc('month', ${companies.createdAt}), 'YYYY-MM')`, n: count() }).from(companies).groupBy(sql`1`).orderBy(sql`1`);
  const stat = (s: string) => byStatus.find((x) => x.status === s)?.n ?? 0;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [{ signupsThisMonth }] = await db.select({ signupsThisMonth: count() }).from(companies).where(gte(companies.createdAt, monthStart));
  const [{ incompleteOnboardings }] = await db.select({ incompleteOnboardings: count() }).from(companies).where(ne(companies.onboardingStatus, "active"));
  ok(res, {
    totalCompanies: byStatus.reduce((a, x) => a + x.n, 0),
    activeCompanies: stat("active"), trialCompanies: stat("trial"), suspendedCompanies: stat("suspended"),
    totalBranches, totalUsers, pendingBranchRequests, expiringSoon, expired,
    monthlyRevenue: Math.round(mrr), annualRevenue: Math.round(mrr * 12),
    planDistribution: planDist, companyGrowth: growth,
    signupsThisMonth, incompleteOnboardings,
  });
}));
export default r;
