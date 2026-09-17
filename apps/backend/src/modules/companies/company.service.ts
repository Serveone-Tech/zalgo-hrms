import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { eq, ilike } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, users, roles, branches } from "../../db/schema.js";
import { DEFAULT_COMPANY_ROLES } from "@hrms/shared-types";
import { assignPlan } from "../subscriptions/subscription.service.js";
import type { CompanyProfileInput, HeadOfficeInput } from "./company.schema.js";

export type OnboardingStatus = "signup" | "profile" | "plan" | "payment" | "active";

// Seeds default roles for a company (Section 34)
export async function seedCompanyRoles(companyId: string) {
  const rows = Object.entries(DEFAULT_COMPANY_ROLES).map(([name, cfg]) => ({
    companyId, name, scope: cfg.scope, permissions: cfg.permissions, isSystem: true,
  }));
  return db.insert(roles).values(rows).returning();
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "company";

async function uniqueSlug(base: string) {
  const root = slugify(base);
  const existing = await db.select({ slug: companies.slug }).from(companies).where(ilike(companies.slug, `${root}%`));
  const taken = new Set(existing.map((e) => e.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) { const candidate = `${root}-${i}`; if (!taken.has(candidate)) return candidate; }
}

export type CreateWorkspaceInput = {
  company: CompanyProfileInput;
  owner: { name: string; email: string; password: string; mobile?: string };
  headOffice?: HeadOfficeInput;
  planId?: string;
  billingCycle?: "monthly" | "yearly";
  startTrial?: boolean;
  createdBy?: string;
  onboardingStatus?: OnboardingStatus;
  status?: "trial" | "active" | "inactive";
};

// Rule (CLAUDE.md): company creation always goes through this — Super Admin form and
// self-service signup both funnel here so a company can never exist half-built.
export async function createCompanyWorkspace(input: CreateWorkspaceInput) {
  const finalSlug = await uniqueSlug(input.company.slug || input.company.name);

  const [company] = await db.insert(companies).values({
    name: input.company.name,
    slug: finalSlug,
    industry: input.company.industry || null,
    companySize: input.company.companySize || null,
    email: input.company.email || null,
    mobile: input.company.mobile || null,
    website: input.company.website || null,
    gstNumber: input.company.gstNumber || null,
    panNumber: input.company.panNumber || null,
    address: input.company.address || null,
    country: input.company.country || "India",
    state: input.company.state || null,
    city: input.company.city || null,
    pinCode: input.company.pinCode || null,
    timezone: input.company.timezone || "Asia/Kolkata",
    status: input.status ?? (input.startTrial ? "trial" : "active"),
    onboardingStatus: input.onboardingStatus ?? "active",
    agentKey: `agt_${crypto.randomBytes(24).toString("base64url")}`,
  }).returning();

  const seeded = await seedCompanyRoles(company.id);
  const adminRole = seeded.find((x) => x.name === "Company Admin")!;

  const ho = input.headOffice;
  const [branch] = await db.insert(branches).values({
    companyId: company.id,
    name: ho?.name || "Head Office",
    city: ho?.city || null, state: ho?.state || null, address: ho?.address || null, pinCode: ho?.pinCode || null,
    latitude: ho?.latitude != null ? String(ho.latitude) : null, longitude: ho?.longitude != null ? String(ho.longitude) : null,
    isHeadOffice: true, status: "active", code: "HO",
  }).returning();

  const [user] = await db.insert(users).values({
    companyId: company.id, branchId: branch.id, roleId: adminRole.id, type: "company_user",
    name: input.owner.name, email: input.owner.email.toLowerCase(), passwordHash: await bcrypt.hash(input.owner.password, 12),
  }).returning();

  await db.update(companies).set({ ownerUserId: user.id }).where(eq(companies.id, company.id));

  if (input.planId) {
    if (!input.createdBy) throw new Error("createdBy is required when assigning a plan");
    await assignPlan({ companyId: company.id, planId: input.planId, billingCycle: input.billingCycle ?? "monthly", startTrial: input.startTrial ?? false, changedBy: input.createdBy, note: "Initial plan on company creation" });
  }

  return { company: { ...company, ownerUserId: user.id }, user, branch };
}

export async function isSlugTaken(slug: string, excludeCompanyId?: string) {
  const [dupe] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, slug)).limit(1);
  return !!dupe && dupe.id !== excludeCompanyId;
}
