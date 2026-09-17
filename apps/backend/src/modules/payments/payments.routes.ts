import { Router } from "express";
import { z } from "zod";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { payments, companies, subscriptions } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { badRequest } from "../../common/errors.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { env } from "../../config/env.js";
import { notFound } from "../../common/errors.js";
import { createOrder, finalizePayment, markPaymentFailed, verifyWebhookSignature, verifySignature } from "./payments.service.js";

const r = Router();

// ---- Razorpay webhook (raw body — mounted with express.raw() in app.ts before express.json()) ----
r.post("/razorpay/webhook", asyncHandler(async (req, res) => {
  const signature = req.headers["x-razorpay-signature"] as string | undefined;
  const raw = req.body as Buffer; // express.raw() gives a Buffer here
  if (!signature || !verifyWebhookSignature(raw, signature)) return res.status(200).json({ received: true, verified: false });

  const event = JSON.parse(raw.toString("utf8")) as { event: string; payload: { payment?: { entity: any }; order?: { entity: any } } };
  const orderId: string | undefined = event.payload?.payment?.entity?.order_id ?? event.payload?.order?.entity?.id;
  if (!orderId) return res.status(200).json({ received: true });
  const [row] = await db.select().from(payments).where(eq(payments.razorpayOrderId, orderId)).limit(1);
  if (!row) return res.status(200).json({ received: true });

  if (event.event === "payment.captured" || event.event === "order.paid") {
    const paymentId = event.payload?.payment?.entity?.id ?? row.razorpayPaymentId ?? "webhook";
    if (row.status !== "paid") await finalizePayment(row, paymentId);
  } else if (event.event === "payment.failed") {
    if (row.status === "created") await markPaymentFailed(row);
  }
  res.status(200).json({ received: true });
}));

// ---- Company: renew / upgrade / pay a pending invoice ----
const company = Router();
company.use(requireAuth, requireTenant, requirePermission("subscription.view"));
company.post("/create-order", validate(z.object({
  purpose: z.enum(["renewal", "upgrade"]), planId: z.string().uuid().optional(), billingCycle: z.enum(["monthly", "yearly"]),
})), asyncHandler(async (req, res) => {
  const b = req.body as { purpose: "renewal" | "upgrade"; planId?: string; billingCycle: "monthly" | "yearly" };
  const cid = req.tenant!.companyId;
  let planId = b.planId;
  if (b.purpose === "renewal") {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, cid)).limit(1);
    if (!sub) throw badRequest("No subscription to renew");
    planId = sub.planId;
  }
  if (!planId) throw badRequest("planId is required");
  const { order, payment, plan } = await createOrder({ companyId: cid, purpose: b.purpose, planId, billingCycle: b.billingCycle, createdBy: req.user!.id });
  audit(req, "payment_order_created", "payment", payment.id, { purpose: b.purpose, planId });
  ok(res, { orderId: order.id, amount: payment.amount, currency: payment.currency, keyId: env.RAZORPAY_KEY_ID ?? "", plan: { id: plan.id, name: plan.name } }, "Order created");
}));
company.get("/me", asyncHandler(async (req, res) => {
  ok(res, await db.select().from(payments).where(eq(payments.companyId, req.tenant!.companyId)).orderBy(desc(payments.createdAt)));
}));
// Immediate feedback after Razorpay Checkout succeeds — the webhook also finalizes the same
// payment asynchronously; finalizePayment is idempotent so whichever arrives first wins.
company.post("/verify-payment", validate(z.object({ razorpayOrderId: z.string(), razorpayPaymentId: z.string(), razorpaySignature: z.string() })),
  asyncHandler(async (req, res) => {
    const b = req.body as { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string };
    const [row] = await db.select().from(payments).where(and(eq(payments.razorpayOrderId, b.razorpayOrderId), eq(payments.companyId, req.tenant!.companyId))).limit(1);
    if (!row) throw notFound("Order not found");
    if (row.status === "paid") return ok(res, { done: true }, "Already paid");
    if (!verifySignature(b.razorpayOrderId, b.razorpayPaymentId, b.razorpaySignature)) {
      await markPaymentFailed(row);
      throw badRequest("Payment verification failed", "PAYMENT_VERIFICATION_FAILED");
    }
    await finalizePayment(row, b.razorpayPaymentId, b.razorpaySignature);
    audit(req, "payment_verified", "payment", row.id);
    ok(res, { done: true }, "Payment verified");
  }));
r.use(company);

// ---- Super Admin ----
const platform = Router();
platform.use(requireAuth, requireSuperAdmin);
platform.get("/", asyncHandler(async (req, res) => {
  const companyId = req.query.companyId as string | undefined;
  const rows = await db.select({
    id: payments.id, companyId: payments.companyId, companyName: companies.name, purpose: payments.purpose,
    amount: payments.amount, currency: payments.currency, status: payments.status,
    razorpayOrderId: payments.razorpayOrderId, razorpayPaymentId: payments.razorpayPaymentId,
    createdAt: payments.createdAt, paidAt: payments.paidAt,
  }).from(payments).leftJoin(companies, eq(companies.id, payments.companyId))
    .where(companyId ? eq(payments.companyId, companyId) : undefined).orderBy(desc(payments.createdAt)).limit(200);
  ok(res, rows);
}));
platform.get("/stats", asyncHandler(async (_req, res) => {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [{ mrr }] = await db.select({ mrr: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) }).from(payments)
    .where(and(eq(payments.status, "paid"), gte(payments.paidAt, monthStart)));
  const byStatus = await db.select({ status: payments.status, n: sql<number>`count(*)`.mapWith(Number) }).from(payments).groupBy(payments.status);
  ok(res, { mrrThisMonth: mrr, byStatus });
}));
r.use("/platform", platform);

export default r;
