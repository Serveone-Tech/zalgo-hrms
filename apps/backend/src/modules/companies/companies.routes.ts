import { Router } from "express";
import { z } from "zod";
import { eq, desc, ilike, sql, count, and, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, users, branches, subscriptions, subscriptionPlans } from "../../db/schema.js";
import { asyncHandler, validate, paginate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, conflict, badRequest } from "../../common/errors.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { audit } from "../../common/audit.js";
import { assignPlan } from "../subscriptions/subscription.service.js";
import { createInvoice, markInvoice } from "../subscriptions/invoice.service.js";
import { companyProfileSchema, headOfficeSchema } from "./company.schema.js";
import { createCompanyWorkspace } from "./company.service.js";
import { makeLogoUpload, logoUrlFor } from "./logo-upload.js";
import { COMPANY_STATUS } from "@hrms/shared-types";

const r = Router();
r.use(requireAuth, requireSuperAdmin);

const createSchema = companyProfileSchema.extend({
  planId: z.string().uuid(),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
  startTrial: z.boolean().default(true),
  markPaid: z.boolean().default(false),
  admin: z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8) }),
  headOffice: headOfficeSchema,
});

r.get("/", asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query as Record<string, unknown>);
  const q = (req.query.q as string | undefined)?.trim();
  const status = req.query.status as string | undefined;
  const onboarding = req.query.onboarding as string | undefined;
  const where = and(
    q ? ilike(companies.name, `%${q}%`) : undefined,
    status && (COMPANY_STATUS as readonly string[]).includes(status) ? eq(companies.status, status as any) : undefined,
    onboarding === "incomplete" ? ne(companies.onboardingStatus, "active") : undefined,
  );
  const rows = await db.select({
    id: companies.id, name: companies.name, slug: companies.slug, status: companies.status, email: companies.email,
    city: companies.city, logoUrl: companies.logoUrl, createdAt: companies.createdAt, onboardingStatus: companies.onboardingStatus,
    planName: subscriptionPlans.name, subscriptionStatus: subscriptions.status, endsAt: subscriptions.endsAt,
    employeeLimit: subscriptions.employeeLimit, branchLimit: subscriptions.branchLimit,
    branchCount: sql<number>`(select count(*) from ${branches} where ${branches.companyId} = ${companies.id} and ${branches.status} = 'active')`.mapWith(Number),
    userCount: sql<number>`(select count(*) from ${users} where ${users.companyId} = ${companies.id})`.mapWith(Number),
  }).from(companies)
    .leftJoin(subscriptions, eq(subscriptions.companyId, companies.id))
    .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(where).orderBy(desc(companies.createdAt)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(companies).where(where);
  ok(res, rows, "OK", { page, limit, total });
}));

r.post("/", validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof createSchema>;
  const [dupeUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, b.admin.email.toLowerCase())).limit(1);
  if (dupeUser) throw conflict("Admin email already registered", "EMAIL_TAKEN");

  const { planId, billingCycle, startTrial, markPaid, admin, headOffice, ...companyData } = b;
  const { company } = await createCompanyWorkspace({
    company: companyData, owner: { name: admin.name, email: admin.email, password: admin.password },
    headOffice, planId, billingCycle, startTrial, createdBy: req.user!.id, onboardingStatus: "active",
    status: startTrial ? "trial" : "active",
  });

  if (markPaid && !startTrial) {
    const inv = await createInvoice(company.id, "plan_assigned", "Marked paid by Super Admin (offline payment)");
    if (inv) await markInvoice(inv.id, "paid");
  }
  audit(req, "create", "company", company.id, { name: company.name, planId });
  created(res, company, "Company created");
}));

r.get("/:id", asyncHandler(async (req, res) => {
  const [c] = await db.select().from(companies).where(eq(companies.id, req.params.id)).limit(1);
  if (!c) throw notFound("Company not found");
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, c.id)).limit(1);
  const plan = sub ? (await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1))[0] : null;
  const branchList = await db.select().from(branches).where(eq(branches.companyId, c.id));
  const admins = await db.select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.companyId, c.id));
  audit(req, "support_view", "company", c.id); // Section 123: sensitive access logged
  ok(res, { ...c, subscription: sub ? { ...sub, plan } : null, branches: branchList, users: admins });
}));

r.put("/:id", validate(companyProfileSchema.partial()), asyncHandler(async (req, res) => {
  const [c] = await db.update(companies).set({ ...(req.body as object), updatedAt: new Date() }).where(eq(companies.id, req.params.id)).returning();
  if (!c) throw notFound("Company not found");
  audit(req, "update", "company", c.id, req.body as Record<string, unknown>);
  ok(res, c, "Company updated");
}));

r.post("/:id/status", validate(z.object({ status: z.enum(COMPANY_STATUS), reason: z.string().optional() })), asyncHandler(async (req, res) => {
  const b = req.body as { status: (typeof COMPANY_STATUS)[number]; reason?: string };
  const [c] = await db.update(companies).set({ status: b.status, updatedAt: new Date() }).where(eq(companies.id, req.params.id)).returning();
  if (!c) throw notFound("Company not found");
  audit(req, b.status === "suspended" ? "suspend" : "status_change", "company", c.id, b);
  ok(res, c, `Company marked ${b.status}`);
}));

// Support: finish a signup that got stuck mid-onboarding
r.post("/:id/complete-onboarding", validate(z.object({
  planId: z.string().uuid().optional(), billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
  startTrial: z.boolean().default(false), markPaid: z.boolean().default(false),
})), asyncHandler(async (req, res) => {
  const b = req.body as { planId?: string; billingCycle: "monthly" | "yearly"; startTrial: boolean; markPaid: boolean };
  const [c] = await db.select().from(companies).where(eq(companies.id, req.params.id)).limit(1);
  if (!c) throw notFound("Company not found");
  if (b.planId) {
    await assignPlan({ companyId: c.id, planId: b.planId, billingCycle: b.billingCycle, startTrial: b.startTrial, changedBy: req.user!.id, note: "Completed by Super Admin" });
    if (b.markPaid && !b.startTrial) {
      const inv = await createInvoice(c.id, "plan_assigned", "Marked paid by Super Admin (offline payment)");
      if (inv) await markInvoice(inv.id, "paid");
    }
  }
  const [updated] = await db.update(companies).set({ onboardingStatus: "active", status: b.startTrial ? "trial" : "active", updatedAt: new Date() }).where(eq(companies.id, c.id)).returning();
  audit(req, "complete_onboarding", "company", c.id, b);
  ok(res, updated, "Onboarding completed");
}));

// Logo upload (also reused right after a Super Admin creates a company)
const upload = makeLogoUpload((req) => req.params.id);
r.post("/:id/logo", upload.single("file"), asyncHandler(async (req, res) => {
  const [c] = await db.select().from(companies).where(eq(companies.id, req.params.id)).limit(1);
  if (!c) throw notFound("Company not found");
  if (!req.file) throw badRequest("File is required (png, jpg, webp, svg — max 2MB)");
  const logoUrl = logoUrlFor(c.id, req.file.filename);
  const [updated] = await db.update(companies).set({ logoUrl, updatedAt: new Date() }).where(eq(companies.id, c.id)).returning();
  audit(req, "update", "company_logo", c.id);
  ok(res, updated, "Logo uploaded");
}));

export default r;
