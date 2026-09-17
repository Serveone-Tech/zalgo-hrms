import Razorpay from "razorpay";
import crypto from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { payments, companies, subscriptionPlans, subscriptionInvoices, users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { badRequest, notFound } from "../../common/errors.js";
import { assignPlan, extendSubscription } from "../subscriptions/subscription.service.js";
import { createInvoice, markInvoice, withGst } from "../subscriptions/invoice.service.js";
import { notify, usersWithPermission } from "../notifications/notify.service.js";
import { emitEvent } from "../automation/engine.js";

type Payment = typeof payments.$inferSelect;
export type PaymentPurpose = "new_subscription" | "renewal" | "upgrade" | "addon";

let client: Razorpay | null = null;
export function razorpay() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw badRequest("Razorpay is not configured. Ask Zalgo Infotech to add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.", "RAZORPAY_NOT_CONFIGURED");
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

export async function planAmount(planId: string, billingCycle: "monthly" | "yearly") {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
  if (!plan || !plan.isActive) throw notFound("Plan not found or inactive");
  const subtotal = Number(billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice);
  return { plan, ...withGst(subtotal) };
}

// Section: no hardcoded prices — amount always derives from subscription_plans, in paise for Razorpay.
export async function createOrder(opts: {
  companyId: string; purpose: PaymentPurpose; planId: string; billingCycle: "monthly" | "yearly"; createdBy: string;
}) {
  const [company] = await db.select().from(companies).where(eq(companies.id, opts.companyId)).limit(1);
  if (!company) throw notFound("Company not found");
  const { plan, total } = await planAmount(opts.planId, opts.billingCycle);
  const receipt = `${company.slug}-${Date.now()}`.slice(0, 40);
  const order = await razorpay().orders.create({
    amount: Math.round(total * 100), currency: "INR", receipt,
    notes: { companyId: company.id, planId: plan.id, billingCycle: opts.billingCycle, purpose: opts.purpose },
  });
  const [row] = await db.insert(payments).values({
    companyId: company.id, purpose: opts.purpose, planId: plan.id, billingCycle: opts.billingCycle,
    amount: String(total), currency: "INR", razorpayOrderId: order.id, status: "created", createdBy: opts.createdBy,
  }).returning();
  return { order, payment: row, plan, company };
}

export function verifySignature(orderId: string, paymentId: string, signature: string) {
  if (!env.RAZORPAY_KEY_SECRET || !signature) return false;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyWebhookSignature(rawBody: Buffer | string, signature: string) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Reuses a still-pending invoice if one exists (e.g. a cron-generated renewal invoice), else creates one.
async function settleInvoice(companyId: string, reason: string, paymentId: string, note: string) {
  const [pending] = await db.select().from(subscriptionInvoices)
    .where(and(eq(subscriptionInvoices.companyId, companyId), eq(subscriptionInvoices.status, "pending")))
    .orderBy(desc(subscriptionInvoices.createdAt)).limit(1);
  if (pending) { await db.update(subscriptionInvoices).set({ paymentId }).where(eq(subscriptionInvoices.id, pending.id)); return markInvoice(pending.id, "paid"); }
  const inv = await createInvoice(companyId, reason, note, { paymentId });
  return inv ? markInvoice(inv.id, "paid") : null;
}

// Idempotent — /verify-payment (client redirect) and the Razorpay webhook can both call this for the same payment.
export async function finalizePayment(paymentRow: Payment, razorpayPaymentId: string, razorpaySignature?: string) {
  if (paymentRow.status === "paid") return paymentRow;
  const [company] = await db.select().from(companies).where(eq(companies.id, paymentRow.companyId)).limit(1);
  if (!company) throw notFound("Company not found");
  const changedBy = paymentRow.createdBy ?? company.ownerUserId;
  if (!changedBy) throw badRequest("Cannot finalize payment: no acting user on record");

  if (paymentRow.purpose === "renewal") {
    await extendSubscription(company.id, paymentRow.billingCycle === "yearly" ? 365 : 30, changedBy, `Razorpay ${razorpayPaymentId}`);
  } else if (paymentRow.planId) {
    await assignPlan({ companyId: company.id, planId: paymentRow.planId, billingCycle: (paymentRow.billingCycle as "monthly" | "yearly") ?? "monthly", startTrial: false, changedBy, note: `Razorpay ${razorpayPaymentId}` });
  }

  const inv = await settleInvoice(company.id, paymentRow.purpose === "renewal" ? "renewal" : "plan_assigned", paymentRow.id, `Razorpay ${razorpayPaymentId}`);

  const [updated] = await db.update(payments).set({
    status: "paid", razorpayPaymentId, razorpaySignature: razorpaySignature ?? null, invoiceId: inv?.id ?? null, paidAt: new Date(), updatedAt: new Date(),
  }).where(eq(payments.id, paymentRow.id)).returning();

  await db.update(companies).set({ status: "active", onboardingStatus: "active", updatedAt: new Date() }).where(eq(companies.id, company.id));

  const [plan] = paymentRow.planId ? await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, paymentRow.planId)).limit(1) : [];
  const ownerIds = [company.ownerUserId, ...(await usersWithPermission(company.id, "company.settings"))].filter((x): x is string => !!x);
  await notify({ companyId: company.id, userIds: [...new Set(ownerIds)], type: "payment.success", title: "Payment received — welcome to Zalgo HRMS", body: `₹${paymentRow.amount} received for ${plan?.name ?? "your subscription"}.`, priority: "success" });
  const superAdmins = (await db.select({ id: users.id }).from(users).where(eq(users.type, "super_admin"))).map((u) => u.id);
  await notify({ companyId: null, userIds: superAdmins, type: "payment.success", title: "New paid company", body: `${company.name} paid ₹${paymentRow.amount} (${plan?.name ?? paymentRow.purpose}).`, priority: "info" });
  emitEvent("payment.success", { companyId: company.id, amount: Number(paymentRow.amount), planName: plan?.name, purpose: paymentRow.purpose });

  return updated;
}

export async function markPaymentFailed(paymentRow: Payment) {
  const [updated] = await db.update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, paymentRow.id)).returning();
  emitEvent("payment.failed", { companyId: paymentRow.companyId, amount: Number(paymentRow.amount), purpose: paymentRow.purpose });
  return updated;
}
