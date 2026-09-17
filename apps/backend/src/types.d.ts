import type { AuthUser } from "@hrms/shared-types";
import type { companies } from "./db/schema.js";

export type TenantContext = {
  companyId: string;
  branchIds: string[] | "all";
  modules: string[];
  limits: { employees: number; branches: number; devices: number };
  subscriptionStatus: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenant?: TenantContext;
      validatedQuery?: Record<string, unknown>;
      onboardingCompany?: typeof companies.$inferSelect;
    }
  }
}
export {};
