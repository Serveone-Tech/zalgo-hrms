import { Router } from "express";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, branches, subscriptionPlans } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { badRequest, notFound } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { audit } from "../../common/audit.js";
import { env } from "../../config/env.js";
import { requireOwnerCompany } from "./onboarding.middleware.js";
import { onboardingProfileSchema } from "../companies/company.schema.js";
import { isSlugTaken } from "../companies/company.service.js";
import { makeLogoUpload, logoUrlFor } from "../companies/logo-upload.js";
import { assignPlan } from "../subscriptions/subscription.service.js";
import { createOrder, finalizePayment, markPaymentFailed, verifySignature } from "../payments/payments.service.js";
import { payments } from "../../db/schema.js";

const r = Router();
r.use(requireAuth, requireOwnerCompany);

r.get("/status", asyncHandler(async (req, res) => {
  const company = req.onboardingCompany!;
  const [headOffice] = await db.select().from(branches).where(and(eq(branches.companyId, company.id), eq(branches.isHeadOffice, true))).limit(1);
  const plans = await db.select().from(subscriptionPlans).where(and(eq(subscriptionPlans.isActive, true), eq(subscriptionPlans.isPublic, true))).orderBy(asc(subscriptionPlans.sortOrder));
  ok(res, {
    onboardingStatus: company.onboardingStatus, company, headOffice: headOffice ?? null,
    plans, razorpayKeyId: env.RAZORPAY_KEY_ID ?? "", trialEnabled: env.SIGNUP_TRIAL_ENABLED,
  });
}));

r.put("/profile", validate(onboardingProfileSchema), asyncHandler(async (req, res) => {
  const company = req.onboardingCompany!;
  const b = req.body as z.infer<typeof onboardingProfileSchema>;
  const slug = b.company.slug;
  if (slug && slug !== company.slug && (await isSlugTaken(slug, company.id))) throw badRequest("This slug is already taken", "SLUG_TAKEN");

  const [updated] = await db.update(companies).set({
    name: b.company.name, slug: slug || company.slug, industry: b.company.industry || null, companySize: b.company.companySize || null,
    email: b.company.email || null, mobile: b.company.mobile || null, website: b.company.website || null,
    gstNumber: b.company.gstNumber || null, panNumber: b.company.panNumber || null, address: b.company.address || null,
    country: b.company.country || "India", state: b.company.state || null, city: b.company.city || null, pinCode: b.company.pinCode || null,
    timezone: b.company.timezone || "Asia/Kolkata", onboardingStatus: "plan", updatedAt: new Date(),
  }).where(eq(companies.id, company.id)).returning();

  await db.update(branches).set({
    name: b.headOffice.name || "Head Office", address: b.headOffice.address || null, city: b.headOffice.city || null,
    state: b.headOffice.state || null, pinCode: b.headOffice.pinCode || null,
    latitude: b.headOffice.latitude != null ? String(b.headOffice.latitude) : null,
    longitude: b.headOffice.longitude != null ? String(b.headOffice.longitude) : null,
  }).where(and(eq(branches.companyId, company.id), eq(branches.isHeadOffice, true)));

  audit(req, "onboarding_profile", "company", company.id);
  ok(res, updated, "Profile saved");
}));

const upload = makeLogoUpload((req) => req.onboardingCompany!.id);
r.post("/logo", upload.single("file"), asyncHandler(async (req, res) => {
  const company = req.onboardingCompany!;
  if (!req.file) throw badRequest("File is required (png, jpg, webp, svg — max 2MB)");
  const logoUrl = logoUrlFor(company.id, req.file.filename);
  const [updated] = await db.update(companies).set({ logoUrl, updatedAt: new Date() }).where(eq(companies.id, company.id)).returning();
  audit(req, "update", "company_logo", company.id);
  ok(res, updated, "Logo uploaded");
}));

async function startTrialFor(companyId: string, planId: string, billingCycle: "monthly" | "yearly", changedBy: string) {
  await assignPlan({ companyId, planId, billingCycle, startTrial: true, changedBy, note: "Self-service trial" });
  await db.update(companies).set({ status: "trial", onboardingStatus: "active", updatedAt: new Date() }).where(eq(companies.id, companyId));
}

const choosePlanSchema = z.object({ planId: z.string().uuid(), billingCycle: z.enum(["monthly", "yearly"]).default("monthly"), startTrial: z.boolean().default(false) });
r.post("/choose-plan", validate(choosePlanSchema), asyncHandler(async (req, res) => {
  const company = req.onboardingCompany!;
  const b = req.body as z.infer<typeof choosePlanSchema>;
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, b.planId)).limit(1);
  if (!plan || !plan.isActive) throw notFound("Plan not found or inactive");

  if (b.startTrial && env.SIGNUP_TRIAL_ENABLED && plan.trialDays > 0) {
    await startTrialFor(company.id, plan.id, b.billingCycle, req.user!.id);
    audit(req, "onboarding_trial_started", "company", company.id, { planId: plan.id });
    return ok(res, { done: true }, "Trial started");
  }

  const { order, payment } = await createOrder({ companyId: company.id, purpose: "new_subscription", planId: plan.id, billingCycle: b.billingCycle, createdBy: req.user!.id });
  await db.update(companies).set({ onboardingStatus: "payment", updatedAt: new Date() }).where(eq(companies.id, company.id));
  audit(req, "onboarding_order_created", "company", company.id, { planId: plan.id });
  ok(res, { orderId: order.id, amount: payment.amount, currency: payment.currency, keyId: env.RAZORPAY_KEY_ID ?? "", plan, company: { name: company.name, email: company.email, mobile: company.mobile } }, "Order created");
}));

const verifySchema = z.object({ razorpayOrderId: z.string(), razorpayPaymentId: z.string(), razorpaySignature: z.string() });
r.post("/verify-payment", validate(verifySchema), asyncHandler(async (req, res) => {
  const company = req.onboardingCompany!;
  const b = req.body as z.infer<typeof verifySchema>;
  const [row] = await db.select().from(payments).where(and(eq(payments.razorpayOrderId, b.razorpayOrderId), eq(payments.companyId, company.id))).limit(1);
  if (!row) throw notFound("Order not found");
  if (row.status === "paid") return ok(res, { done: true }, "Already paid");

  if (!verifySignature(b.razorpayOrderId, b.razorpayPaymentId, b.razorpaySignature)) {
    await markPaymentFailed(row);
    throw badRequest("Payment verification failed", "PAYMENT_VERIFICATION_FAILED");
  }
  await finalizePayment(row, b.razorpayPaymentId, b.razorpaySignature);
  audit(req, "payment_verified", "payment", row.id, { companyId: company.id });
  ok(res, { done: true }, "Payment verified");
}));

r.post("/skip-to-panel", asyncHandler(async (req, res) => {
  const company = req.onboardingCompany!;
  if (!env.SIGNUP_TRIAL_ENABLED) throw badRequest("Trials are currently disabled");
  if (!["plan", "payment"].includes(company.onboardingStatus)) throw badRequest("Onboarding already completed");
  const candidates = await db.select().from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.isActive, true), eq(subscriptionPlans.isPublic, true)))
    .orderBy(asc(subscriptionPlans.monthlyPrice));
  const eligible = candidates.find((p) => p.trialDays > 0);
  if (!eligible) throw badRequest("No trial-eligible plan available");
  await startTrialFor(company.id, eligible.id, "monthly", req.user!.id);
  audit(req, "onboarding_trial_started", "company", company.id, { planId: eligible.id, via: "skip-to-panel" });
  ok(res, { done: true }, "Trial started");
}));

export default r;
