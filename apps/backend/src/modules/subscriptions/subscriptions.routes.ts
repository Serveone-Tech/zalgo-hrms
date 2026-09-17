import { Router } from "express";
import { z } from "zod";
import { eq, desc, asc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptions, subscriptionPlans, subscriptionHistory } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { assignPlan, computeTotal, extendSubscription, setSubscriptionStatus } from "./subscription.service.js";
import { createInvoice } from "./invoice.service.js";

const r = Router();
r.use(requireAuth);

// ---- Company side: apna subscription dekhna ----
r.get("/plans", asyncHandler(async (_req, res) => {
  ok(res, await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(asc(subscriptionPlans.sortOrder)));
}));
r.get("/me", requireTenant, requirePermission("subscription.view"), asyncHandler(async (req, res) => {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, req.tenant!.companyId)).limit(1);
  const plan = s ? (await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, s.planId)).limit(1))[0] : null;
  const history = await db.select().from(subscriptionHistory).where(eq(subscriptionHistory.companyId, req.tenant!.companyId)).orderBy(desc(subscriptionHistory.createdAt)).limit(20);
  ok(res, s ? { ...s, total: computeTotal(s), plan, history } : null);
}));

// ---- Super Admin side ----
const sa = Router();
sa.use(requireSuperAdmin);
sa.post("/:companyId/assign", validate(z.object({ planId: z.string().uuid(), billingCycle: z.enum(["monthly", "yearly"]).default("monthly"), startTrial: z.boolean().default(false), note: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const s = await assignPlan({ companyId: req.params.companyId, changedBy: req.user!.id, ...(req.body as any) });
    await createInvoice(req.params.companyId, "plan_assigned", (req.body as any).note);
    audit(req, "subscription_change", "subscription", s.id, { companyId: req.params.companyId, planId: s.planId });
    ok(res, s, "Plan assigned");
  }));
sa.post("/:companyId/extend", validate(z.object({ days: z.coerce.number().int().min(1).max(3650), note: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const b = req.body as { days: number; note?: string };
    const s = await extendSubscription(req.params.companyId, b.days, req.user!.id, b.note);
    await createInvoice(req.params.companyId, "renewal", b.note ?? `Extended ${b.days} days`);
    audit(req, "subscription_extend", "subscription", s.id, { days: b.days });
    ok(res, s, "Subscription extended");
  }));
sa.post("/:companyId/status", validate(z.object({ status: z.enum(["active", "suspended", "cancelled", "past_due", "pending_payment"]), note: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const b = req.body as { status: any; note?: string };
    const s = await setSubscriptionStatus(req.params.companyId, b.status, req.user!.id, b.note);
    audit(req, "subscription_status", "subscription", s.id, { status: b.status });
    ok(res, s, "Subscription updated");
  }));
sa.get("/:companyId", asyncHandler(async (req, res) => {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, req.params.companyId)).limit(1);
  const plan = s ? (await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, s.planId)).limit(1))[0] : null;
  const history = await db.select().from(subscriptionHistory).where(eq(subscriptionHistory.companyId, req.params.companyId)).orderBy(desc(subscriptionHistory.createdAt));
  ok(res, s ? { ...s, total: computeTotal(s), plan, history } : null);
}));
r.use("/company", sa);
export default r;
