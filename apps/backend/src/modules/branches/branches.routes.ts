import { Router } from "express";
import { z } from "zod";
import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../../db/index.js";
import { branches, branchRequests, subscriptions, subscriptionPlans, subscriptionHistory } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, badRequest, conflict } from "../../common/errors.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { requireTenant, assertBranchInTenant } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { createInvoice } from "../subscriptions/invoice.service.js";
import { emitToCompany, emitToPlatform } from "../../sockets.js";
import { notify, usersWithPermission } from "../notifications/notify.service.js";

const r = Router();
r.use(requireAuth);

const requestSchema = z.object({
  name: z.string().min(2).max(150), code: z.string().max(50).optional(),
  address: z.string().optional(), country: z.string().default("India"), state: z.string().optional(), city: z.string().optional(), pinCode: z.string().max(12).optional(),
  expectedEmployees: z.coerce.number().int().min(0).default(0), expectedDevices: z.coerce.number().int().min(0).default(0),
  reason: z.string().optional(), branchType: z.string().max(50).optional(), expectedOpeningDate: z.coerce.date().optional(),
});

// ===== Company side =====
const c = Router();
c.use(requireTenant);

c.get("/", requirePermission("branch.view"), asyncHandler(async (req, res) => {
  const rows = await db.select().from(branches).where(eq(branches.companyId, req.tenant!.companyId)).orderBy(desc(branches.isHeadOffice), branches.name);
  ok(res, req.tenant!.branchIds === "all" ? rows : rows.filter((b) => (req.tenant!.branchIds as string[]).includes(b.id)));
}));

c.get("/requests", requirePermission("branch.view"), asyncHandler(async (req, res) => {
  ok(res, await db.select().from(branchRequests).where(eq(branchRequests.companyId, req.tenant!.companyId)).orderBy(desc(branchRequests.createdAt)));
}));

// Section 15/126: company branch request karti hai, seedha activate nahi hota
c.post("/requests", requirePermission("branch.request"), validate(requestSchema), asyncHandler(async (req, res) => {
  const companyId = req.tenant!.companyId;
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1);
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
  const [{ activeCount }] = await db.select({ activeCount: count() }).from(branches).where(and(eq(branches.companyId, companyId), eq(branches.status, "active")));
  const [{ pendingCount }] = await db.select({ pendingCount: count() }).from(branchRequests).where(and(eq(branchRequests.companyId, companyId), eq(branchRequests.status, "pending")));
  // Default price: agar limit ke andar hai to 0, warna plan ka additional branch price (Super Admin override kar sakta hai)
  const withinLimit = activeCount + pendingCount < sub.branchLimit;
  const defaultPrice = withinLimit ? "0" : plan.additionalBranchPrice;
  const [reqRow] = await db.insert(branchRequests).values({ ...(req.body as z.infer<typeof requestSchema>), companyId, defaultPrice, requestedBy: req.user!.id, status: "pending" }).returning();
  emitToPlatform("branch:requested", { companyId, name: reqRow.name });
  audit(req, "create", "branch_request", reqRow.id, { name: reqRow.name, defaultPrice });
  created(res, reqRow, "Branch request submitted for approval");
}));

c.post("/requests/:id/cancel", requirePermission("branch.request"), asyncHandler(async (req, res) => {
  const [row] = await db.update(branchRequests).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(branchRequests.id, req.params.id), eq(branchRequests.companyId, req.tenant!.companyId), eq(branchRequests.status, "pending"))).returning();
  if (!row) throw notFound("Pending request not found");
  audit(req, "cancel", "branch_request", row.id);
  ok(res, row, "Request cancelled");
}));

c.put("/:id", requirePermission("branch.update"), validate(requestSchema.partial().extend({ latitude: z.coerce.number().optional(), longitude: z.coerce.number().optional(), geofenceRadiusM: z.coerce.number().int().optional(), timezone: z.string().optional() })),
  asyncHandler(async (req, res) => {
    await assertBranchInTenant(req, req.params.id);
    const b = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = { ...b, updatedAt: new Date() };
    if (b.latitude !== undefined) patch.latitude = String(b.latitude);
    if (b.longitude !== undefined) patch.longitude = String(b.longitude);
    delete patch.expectedEmployees; delete patch.expectedDevices; delete patch.reason; delete patch.branchType; delete patch.expectedOpeningDate;
    const [row] = await db.update(branches).set(patch).where(eq(branches.id, req.params.id)).returning();
    audit(req, "update", "branch", row.id, b);
    ok(res, row, "Branch updated");
  }));
r.use("/", c);

// ===== Super Admin side (Section 18/129) =====
const sa = Router();
sa.use(requireSuperAdmin);
sa.get("/requests", asyncHandler(async (req, res) => {
  const status = (req.query.status as string) || "pending";
  ok(res, await db.select().from(branchRequests).where(status === "all" ? undefined : eq(branchRequests.status, status as any)).orderBy(desc(branchRequests.createdAt)));
}));
sa.post("/requests/:id/approve", validate(z.object({ approvedPrice: z.coerce.number().min(0).optional(), note: z.string().optional() })), asyncHandler(async (req, res) => {
  const [rq] = await db.select().from(branchRequests).where(eq(branchRequests.id, req.params.id)).limit(1);
  if (!rq) throw notFound("Request not found");
  if (!["pending", "under_review"].includes(rq.status)) throw conflict("Request already reviewed");
  const b = req.body as { approvedPrice?: number; note?: string };
  const price = b.approvedPrice ?? Number(rq.defaultPrice ?? 0);

  const [branch] = await db.insert(branches).values({
    companyId: rq.companyId, name: rq.name, code: rq.code, address: rq.address, country: rq.country, state: rq.state, city: rq.city, pinCode: rq.pinCode,
    status: "active", approvedPrice: String(price),
  }).returning();
  await db.update(branchRequests).set({ status: "approved", approvedPrice: String(price), branchId: branch.id, reviewedBy: req.user!.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(branchRequests.id, rq.id));

  // Subscription update: branch limit +1 (agar zaroorat ho) aur additional branch total += price
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, rq.companyId)).limit(1);
  if (sub) {
    const [{ activeCount }] = await db.select({ activeCount: count() }).from(branches).where(and(eq(branches.companyId, rq.companyId), eq(branches.status, "active")));
    await db.update(subscriptions).set({
      branchLimit: Math.max(sub.branchLimit, activeCount),
      additionalBranchTotal: String(Number(sub.additionalBranchTotal) + price),
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, sub.id));
    await db.insert(subscriptionHistory).values({ companyId: rq.companyId, subscriptionId: sub.id, action: "branch_added", changedBy: req.user!.id, note: `${rq.name} approved @ ₹${price}/mo${b.note ? " — " + b.note : ""}` });
  }
  if (price > 0) await createInvoice(rq.companyId, "branch_approved", `Branch ${rq.name} @ ₹${price}/mo`);
  emitToCompany(rq.companyId, "branch:approved", { branchId: branch.id, name: branch.name });
  await notify({ companyId: rq.companyId, userIds: await usersWithPermission(rq.companyId, "branch.request"), type: "branch.decided", title: `Branch approved: ${branch.name}`, body: price > 0 ? `Additional ₹${price}/month added to your subscription.` : "Included in your plan.", link: "/app/branches", priority: "success" });
  audit(req, "branch_approval", "branch_request", rq.id, { companyId: rq.companyId, branchId: branch.id, price });
  ok(res, { request: rq, branch }, "Branch approved and activated");
}));
sa.post("/requests/:id/reject", validate(z.object({ reason: z.string().min(3) })), asyncHandler(async (req, res) => {
  const [row] = await db.update(branchRequests).set({ status: "rejected", rejectionReason: (req.body as { reason: string }).reason, reviewedBy: req.user!.id, reviewedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(branchRequests.id, req.params.id), eq(branchRequests.status, "pending"))).returning();
  if (!row) throw notFound("Pending request not found");
  emitToCompany(row.companyId, "branch:rejected", { name: row.name, reason: row.rejectionReason });
  await notify({ companyId: row.companyId, userIds: await usersWithPermission(row.companyId, "branch.request"), type: "branch.decided", title: `Branch request rejected: ${row.name}`, body: row.rejectionReason ?? undefined, link: "/app/branches", priority: "warning" });
  audit(req, "branch_rejection", "branch_request", row.id, { reason: row.rejectionReason });
  ok(res, row, "Branch request rejected");
}));
sa.post("/requests/:id/review", asyncHandler(async (req, res) => {
  const [row] = await db.update(branchRequests).set({ status: "under_review", updatedAt: new Date() }).where(and(eq(branchRequests.id, req.params.id), eq(branchRequests.status, "pending"))).returning();
  if (!row) throw badRequest("Request not pending");
  ok(res, row, "Marked under review");
}));
r.use("/platform", sa);
export default r;
