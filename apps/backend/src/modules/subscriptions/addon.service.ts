import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptions, subscriptionAddons, companyAddons } from "../../db/schema.js";
import { notFound, badRequest } from "../../common/errors.js";

// Add-on attach/detach ke baad subscription ke effective limits/modules/addonsTotal recompute hote hain.
export async function recomputeAddons(companyId: string) {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1);
  if (!s) throw notFound("Subscription not found");
  const rows = await db.select({ ca: companyAddons, a: subscriptionAddons }).from(companyAddons)
    .innerJoin(subscriptionAddons, eq(subscriptionAddons.id, companyAddons.addonId)).where(eq(companyAddons.companyId, companyId));
  const { subscriptionPlans } = await import("../../db/schema.js");
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, s.planId)).limit(1);

  let extraEmployees = 0, extraDevices = 0, total = 0;
  const modules = new Set<string>(plan.modules);
  for (const { ca, a } of rows) {
    total += Number(ca.price) * ca.units;
    if (a.type === "employee_pack") extraEmployees += a.quantity * ca.units;
    if (a.type === "device") extraDevices += a.quantity * ca.units;
    if (a.type === "module" && a.moduleKey) modules.add(a.moduleKey);
  }
  const [u] = await db.update(subscriptions).set({
    employeeLimit: plan.includedEmployees + extraEmployees,
    deviceLimit: plan.includedDevices + extraDevices,
    modules: [...modules], addonsTotal: String(total), updatedAt: new Date(),
  }).where(eq(subscriptions.id, s.id)).returning();
  return u;
}

export async function attachAddon(companyId: string, addonId: string, units: number, price: number | undefined, by: string) {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1);
  if (!s) throw notFound("Subscription not found");
  const [a] = await db.select().from(subscriptionAddons).where(and(eq(subscriptionAddons.id, addonId), eq(subscriptionAddons.isActive, true))).limit(1);
  if (!a) throw badRequest("Add-on not found or inactive");
  const unit = price ?? Number(s.billingCycle === "yearly" ? a.yearlyPrice : a.monthlyPrice);
  const [existing] = await db.select().from(companyAddons).where(and(eq(companyAddons.companyId, companyId), eq(companyAddons.addonId, addonId))).limit(1);
  if (existing) await db.update(companyAddons).set({ units: existing.units + units, price: String(unit), updatedAt: new Date() }).where(eq(companyAddons.id, existing.id));
  else await db.insert(companyAddons).values({ companyId, subscriptionId: s.id, addonId, units, price: String(unit), addedBy: by });
  return recomputeAddons(companyId);
}

export async function detachAddon(companyId: string, companyAddonId: string) {
  const [row] = await db.delete(companyAddons).where(and(eq(companyAddons.id, companyAddonId), eq(companyAddons.companyId, companyId))).returning();
  if (!row) throw notFound("Add-on not attached");
  return recomputeAddons(companyId);
}
