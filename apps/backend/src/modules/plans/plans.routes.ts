import { Router } from "express";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptionPlans } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound } from "../../common/errors.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { audit } from "../../common/audit.js";
import { MODULE_KEYS, ATTENDANCE_FEATURE_KEYS } from "@hrms/shared-types";

const r = Router();
const money = z.coerce.number().min(0);
const planSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  monthlyPrice: money, yearlyPrice: money,
  trialDays: z.coerce.number().int().min(0).default(14),
  includedEmployees: z.coerce.number().int().min(1),
  includedBranches: z.coerce.number().int().min(1),
  includedDevices: z.coerce.number().int().min(0),
  includedStorageMb: z.coerce.number().int().min(0).default(1024),
  additionalBranchPrice: money.default(0),
  additionalEmployeePrice: money.default(0),
  additionalDevicePrice: money.default(0),
  modules: z.array(z.enum(MODULE_KEYS as [string, ...string[]])),
  attendanceFeatures: z.array(z.enum(ATTENDANCE_FEATURE_KEYS as [string, ...string[]])).default(["selfCheckin"]),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});
const toRow = (b: z.infer<typeof planSchema>) => ({
  ...b, monthlyPrice: String(b.monthlyPrice), yearlyPrice: String(b.yearlyPrice),
  additionalBranchPrice: String(b.additionalBranchPrice), additionalEmployeePrice: String(b.additionalEmployeePrice),
  additionalDevicePrice: String(b.additionalDevicePrice),
});

// Public-ish list for company admin (active plans only) is exposed under /subscriptions/plans
r.use(requireAuth, requireSuperAdmin);

r.get("/", asyncHandler(async (_req, res) => {
  ok(res, await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder)));
}));
r.post("/", validate(planSchema), asyncHandler(async (req, res) => {
  const [p] = await db.insert(subscriptionPlans).values(toRow(req.body)).returning();
  audit(req, "create", "subscription_plan", p.id, { name: p.name });
  created(res, p, "Plan created");
}));
r.put("/:id", validate(planSchema.partial()), asyncHandler(async (req, res) => {
  const body = req.body as Partial<z.infer<typeof planSchema>>;
  const patch: Record<string, unknown> = { ...body, updatedAt: new Date() };
  for (const k of ["monthlyPrice", "yearlyPrice", "additionalBranchPrice", "additionalEmployeePrice", "additionalDevicePrice"] as const)
    if (body[k] !== undefined) patch[k] = String(body[k]);
  const [p] = await db.update(subscriptionPlans).set(patch).where(eq(subscriptionPlans.id, req.params.id)).returning();
  if (!p) throw notFound("Plan not found");
  audit(req, "update", "subscription_plan", p.id, body);
  ok(res, p, "Plan updated");
}));
r.delete("/:id", asyncHandler(async (req, res) => {
  const [p] = await db.update(subscriptionPlans).set({ isActive: false }).where(eq(subscriptionPlans.id, req.params.id)).returning();
  if (!p) throw notFound("Plan not found");
  audit(req, "disable", "subscription_plan", p.id);
  ok(res, p, "Plan disabled");
}));
export default r;
