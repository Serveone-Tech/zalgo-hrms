import { Router } from "express";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptionAddons, companyAddons } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound } from "../../common/errors.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { audit } from "../../common/audit.js";
import { attachAddon, detachAddon } from "./addon.service.js";
import { createInvoice } from "./invoice.service.js";
import { MODULE_KEYS } from "@hrms/shared-types";

const r = Router();
r.use(requireAuth, requireSuperAdmin);
const schema = z.object({
  name: z.string().min(2), slug: z.string().min(2).regex(/^[a-z0-9-]+$/), description: z.string().optional(),
  type: z.enum(["employee_pack", "device", "storage", "module", "custom"]), quantity: z.coerce.number().int().min(1).default(1),
  moduleKey: z.enum(MODULE_KEYS as [string, ...string[]]).optional(),
  monthlyPrice: z.coerce.number().min(0), yearlyPrice: z.coerce.number().min(0), isActive: z.boolean().default(true),
});

r.get("/", asyncHandler(async (_req, res) => { ok(res, await db.select().from(subscriptionAddons).orderBy(asc(subscriptionAddons.name))); }));
r.post("/", validate(schema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof schema>;
  const [a] = await db.insert(subscriptionAddons).values({ ...b, monthlyPrice: String(b.monthlyPrice), yearlyPrice: String(b.yearlyPrice) }).returning();
  audit(req, "create", "addon", a.id, { name: a.name }); created(res, a, "Add-on created");
}));
r.put("/:id", validate(schema.partial()), asyncHandler(async (req, res) => {
  const b = req.body as Partial<z.infer<typeof schema>>;
  const patch: Record<string, unknown> = { ...b, updatedAt: new Date() };
  if (b.monthlyPrice !== undefined) patch.monthlyPrice = String(b.monthlyPrice);
  if (b.yearlyPrice !== undefined) patch.yearlyPrice = String(b.yearlyPrice);
  const [a] = await db.update(subscriptionAddons).set(patch).where(eq(subscriptionAddons.id, req.params.id)).returning();
  if (!a) throw notFound("Add-on not found");
  audit(req, "update", "addon", a.id, b); ok(res, a, "Add-on updated");
}));
r.delete("/:id", asyncHandler(async (req, res) => {
  const [a] = await db.update(subscriptionAddons).set({ isActive: false, updatedAt: new Date() }).where(eq(subscriptionAddons.id, req.params.id)).returning();
  if (!a) throw notFound("Add-on not found");
  audit(req, "disable", "addon", a.id);
  ok(res, a, "Add-on disabled");
}));

// Company attach/detach
r.get("/company/:companyId", asyncHandler(async (req, res) => {
  ok(res, await db.select({ id: companyAddons.id, units: companyAddons.units, price: companyAddons.price, addon: subscriptionAddons })
    .from(companyAddons).innerJoin(subscriptionAddons, eq(subscriptionAddons.id, companyAddons.addonId)).where(eq(companyAddons.companyId, req.params.companyId)));
}));
r.post("/company/:companyId", validate(z.object({ addonId: z.string().uuid(), units: z.coerce.number().int().min(1).default(1), price: z.coerce.number().min(0).optional() })), asyncHandler(async (req, res) => {
  const b = req.body as { addonId: string; units: number; price?: number };
  const s = await attachAddon(req.params.companyId, b.addonId, b.units, b.price, req.user!.id);
  await createInvoice(req.params.companyId, "addon_added", `Add-on attached ×${b.units}`);
  audit(req, "addon_attach", "subscription", s.id, b); ok(res, s, "Add-on attached");
}));
r.delete("/company/:companyId/:id", asyncHandler(async (req, res) => {
  const s = await detachAddon(req.params.companyId, req.params.id);
  audit(req, "addon_detach", "subscription", s.id, { companyAddonId: req.params.id }); ok(res, s, "Add-on removed");
}));
export default r;
