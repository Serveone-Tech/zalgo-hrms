import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptionPlans, subscriptions, subscriptionHistory, companies } from "../../db/schema.js";
import { notFound, badRequest } from "../../common/errors.js";

// Section 28: Final = base + extra branches + extra employees + extra devices + add-ons. Kuch bhi hardcode nahi.
export const computeTotal = (s: typeof subscriptions.$inferSelect) =>
  [s.basePrice, s.additionalBranchTotal, s.additionalEmployeeTotal, s.additionalDeviceTotal, s.addonsTotal]
    .reduce((a, v) => a + Number(v), 0);

export async function assignPlan(opts: {
  companyId: string; planId: string; billingCycle: "monthly" | "yearly"; changedBy: string; startTrial?: boolean; note?: string;
}) {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, opts.planId)).limit(1);
  if (!plan || !plan.isActive) throw notFound("Plan not found or inactive");
  const [company] = await db.select().from(companies).where(eq(companies.id, opts.companyId)).limit(1);
  if (!company) throw notFound("Company not found");

  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, opts.companyId)).limit(1);
  const now = new Date();
  const ends = new Date(now);
  if (opts.startTrial) ends.setDate(ends.getDate() + plan.trialDays);
  else if (opts.billingCycle === "yearly") ends.setFullYear(ends.getFullYear() + 1);
  else ends.setMonth(ends.getMonth() + 1);

  const values = {
    companyId: opts.companyId, planId: plan.id,
    status: (opts.startTrial ? "trial" : "active") as "trial" | "active",
    billingCycle: opts.billingCycle,
    employeeLimit: plan.includedEmployees,
    // Approved extra branches carry over on plan change
    branchLimit: plan.includedBranches + Math.max(0, (existing?.branchLimit ?? plan.includedBranches) - (existing ? (await planIncluded(existing.planId)).includedBranches : plan.includedBranches)),
    deviceLimit: plan.includedDevices,
    modules: plan.modules,
    basePrice: opts.billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice,
    additionalBranchTotal: existing?.additionalBranchTotal ?? "0",
    startsAt: now, endsAt: ends, updatedAt: now,
  };

  let sub;
  if (existing) [sub] = await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id)).returning();
  else [sub] = await db.insert(subscriptions).values(values).returning();

  let action = "assigned";
  if (existing) {
    const prev = await planIncluded(existing.planId);
    action = Number(plan.monthlyPrice) >= Number(prev.monthlyPrice) ? "upgraded" : "downgraded";
  }
  await db.insert(subscriptionHistory).values({
    companyId: opts.companyId, subscriptionId: sub.id, action,
    previousPlanId: existing?.planId ?? null, newPlanId: plan.id, changedBy: opts.changedBy, note: opts.note,
  });
  if (company.status === "trial" && !opts.startTrial) await db.update(companies).set({ status: "active" }).where(eq(companies.id, company.id));
  const { recomputeAddons } = await import("./addon.service.js");
  return recomputeAddons(opts.companyId);
}

async function planIncluded(planId: string) {
  const [p] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
  if (!p) throw badRequest("Plan missing");
  return p;
}

export async function extendSubscription(companyId: string, days: number, changedBy: string, note?: string) {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1);
  if (!s) throw notFound("Subscription not found");
  const base = s.endsAt.getTime() > Date.now() ? s.endsAt : new Date();
  const endsAt = new Date(base.getTime() + days * 86400000);
  const [u] = await db.update(subscriptions).set({ endsAt, status: "active", updatedAt: new Date() }).where(eq(subscriptions.id, s.id)).returning();
  await db.insert(subscriptionHistory).values({ companyId, subscriptionId: s.id, action: "extended", changedBy, note: note ?? `+${days} days` });
  return u;
}

export async function setSubscriptionStatus(companyId: string, status: typeof subscriptions.$inferSelect.status, changedBy: string, note?: string) {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1);
  if (!s) throw notFound("Subscription not found");
  const [u] = await db.update(subscriptions).set({ status, updatedAt: new Date() }).where(eq(subscriptions.id, s.id)).returning();
  await db.insert(subscriptionHistory).values({ companyId, subscriptionId: s.id, action: status, changedBy, note });
  return u;
}
