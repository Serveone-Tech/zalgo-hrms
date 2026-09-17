import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies } from "../../db/schema.js";
import { forbidden, notFound } from "../../common/errors.js";
import { hasPermission } from "../../middleware/permission.js";

// Deliberately not requireTenant — a company mid-onboarding has no subscription yet,
// which would make requireTenant reject every request with NO_SUBSCRIPTION.
export const requireOwnerCompany = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (req.user?.type !== "company_user" || !req.user.companyId) return next(forbidden());
    const [company] = await db.select().from(companies).where(eq(companies.id, req.user.companyId)).limit(1);
    if (!company) return next(notFound("Company not found"));
    const isOwner = company.ownerUserId === req.user.id;
    if (!isOwner && !hasPermission(req, "company.settings")) return next(forbidden("Only the account owner can manage onboarding"));
    req.onboardingCompany = company;
    next();
  } catch (e) { next(e); }
};
