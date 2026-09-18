import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { subscriptions, branches } from "../db/schema.js";
import { forbidden, AppError } from "../common/errors.js";

// Section 8 & 112: tenant context har company request par set hota hai.
// Services sirf req.tenant.companyId use karti hain — user-supplied company id kabhi trust nahi hota.
export const requireTenant = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const u = req.user;
    if (!u) return next(forbidden());

    let companyId: string | null = u.companyId;
    // Super Admin support-view: header se company choose kar sakta hai (audit logged in routes)
    if (u.type === "super_admin") companyId = (req.headers["x-company-id"] as string | undefined) ?? null;
    if (!companyId) return next(forbidden("Company context missing"));

    if (u.type === "company_user") {
      const st = u.company?.status;
      if (st === "suspended") throw new AppError(403, "Your company account is suspended. Contact support.", "COMPANY_SUSPENDED");
      if (st === "inactive") throw new AppError(403, "Your company account is inactive.", "COMPANY_INACTIVE");
      if (u.company?.onboardingStatus && u.company.onboardingStatus !== "active") {
        throw new AppError(403, "Complete onboarding to continue", "ONBOARDING_INCOMPLETE");
      }
    }

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId)).limit(1);
    if (!sub) throw new AppError(402, "No active subscription", "NO_SUBSCRIPTION");

    const now = Date.now();
    const graceEnd = new Date(sub.endsAt).getTime() + sub.gracePeriodDays * 86400000;
    const exempt = req.path.startsWith("/subscription") || req.path.startsWith("/payments");
    if (u.type === "company_user" && (["expired", "cancelled", "suspended"].includes(sub.status) || now > graceEnd) && !exempt) {
      throw new AppError(402, "Subscription expired. Please renew to continue.", "SUBSCRIPTION_EXPIRED");
    }

    let branchIds: string[] | "all" = "all";
    if (u.type === "company_user" && (u.scope === "branch" || u.scope === "department" || u.scope === "team" || u.scope === "own")) {
      branchIds = u.branchId ? [u.branchId] : [];
    }

    req.tenant = {
      companyId, branchIds,
      modules: sub.modules,
      attendanceFeatures: sub.attendanceFeatures,
      limits: { employees: sub.employeeLimit, branches: sub.branchLimit, devices: sub.deviceLimit },
      subscriptionStatus: sub.status,
    };
    next();
  } catch (e) { next(e); }
};

// Helper: ensure a branch belongs to current tenant (IDOR protection)
export async function assertBranchInTenant(req: Request, branchId: string) {
  const [b] = await db.select().from(branches).where(eq(branches.id, branchId)).limit(1);
  if (!b || b.companyId !== req.tenant!.companyId) throw forbidden("Branch not found in your company");
  if (req.tenant!.branchIds !== "all" && !req.tenant!.branchIds.includes(branchId)) throw forbidden("You cannot access this branch");
  return b;
}
