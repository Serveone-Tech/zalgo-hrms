import { eq, sql, and, gte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptions, subscriptionPlans, subscriptionInvoices } from "../../db/schema.js";
import { computeTotal } from "./subscription.service.js";

// Invoice number: ZI-YYYYMM-0001 (Zalgo Infotech). Month-wise sequence.
async function nextInvoiceNumber() {
  const ym = new Date().toISOString().slice(0, 7).replace("-", "");
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(subscriptionInvoices).where(gte(subscriptionInvoices.createdAt, monthStart));
  return `ZI-${ym}-${String(n + 1).padStart(4, "0")}`;
}

// Section 28 / Razorpay: single source of truth for GST-inclusive totals — no hardcoded prices.
export function withGst(subtotal: number, taxPercent = 18) {
  const tax = Math.round(subtotal * taxPercent) / 100;
  return { taxPercent, tax, total: subtotal + tax };
}

export async function createInvoice(companyId: string, reason: string, notes?: string, opts?: { periodStart?: Date; periodEnd?: Date; taxPercent?: number; paymentId?: string }) {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1);
  if (!s) return null;
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, s.planId)).limit(1);
  const subtotal = computeTotal(s);
  const { taxPercent, tax, total } = withGst(subtotal, opts?.taxPercent);
  const [inv] = await db.insert(subscriptionInvoices).values({
    companyId, subscriptionId: s.id, paymentId: opts?.paymentId, invoiceNumber: await nextInvoiceNumber(), planName: plan?.name,
    basePrice: s.basePrice, additionalBranchPrice: s.additionalBranchTotal, additionalEmployeePrice: s.additionalEmployeeTotal,
    additionalDevicePrice: s.additionalDeviceTotal, addonsPrice: s.addonsTotal,
    taxPercent: String(taxPercent), taxAmount: String(tax), totalAmount: String(total),
    periodStart: opts?.periodStart ?? s.startsAt, periodEnd: opts?.periodEnd ?? s.endsAt, reason, notes,
    status: s.status === "trial" ? "cancelled" : "pending", // trial par invoice zero-value / cancelled
  }).returning();
  return inv;
}

export const listInvoices = (companyId: string) =>
  db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.companyId, companyId)).orderBy(sql`${subscriptionInvoices.createdAt} desc`);

export async function markInvoice(id: string, status: "paid" | "cancelled" | "pending") {
  const [inv] = await db.update(subscriptionInvoices).set({ status, paidAt: status === "paid" ? new Date() : null }).where(eq(subscriptionInvoices.id, id)).returning();
  if (inv && status === "paid") {
    // Payment received → subscription active (agar past_due / pending_payment tha)
    await db.update(subscriptions).set({ status: "active", updatedAt: new Date() })
      .where(and(eq(subscriptions.companyId, inv.companyId), sql`${subscriptions.status} in ('past_due','pending_payment','trial')`));
  }
  return inv;
}
