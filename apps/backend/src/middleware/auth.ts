import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/index.js";
import { users, roles, companies, subscriptions } from "../db/schema.js";
import { unauthorized, forbidden } from "../common/errors.js";
import type { AuthUser, DataScope, ModuleKey, Permission } from "@hrms/shared-types";

export type AccessPayload = { sub: string; type: "super_admin" | "company_user"; companyId: string | null };

export const signAccess = (p: AccessPayload) =>
  jwt.sign(p, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"] });

// Har request par fresh user + role + subscription load hota hai —
// isse role change / suspension / plan change turant effective ho jata hai.
export async function buildAuthUser(userId: string): Promise<AuthUser | null> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !u.isActive) return null;

  if (u.type === "super_admin") {
    return { id: u.id, name: u.name, email: u.email, type: "super_admin", companyId: null, branchId: null,
      roleName: "Super Admin", permissions: "*", scope: "company", modules: [], company: null };
  }

  const [company] = u.companyId ? await db.select().from(companies).where(eq(companies.id, u.companyId)).limit(1) : [];
  if (!company) return null;
  const [role] = u.roleId ? await db.select().from(roles).where(eq(roles.id, u.roleId)).limit(1) : [];
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, company.id)).limit(1);

  return {
    id: u.id, name: u.name, email: u.email, type: "company_user",
    companyId: company.id, branchId: u.branchId,
    roleName: role?.name ?? null,
    permissions: (role?.permissions ?? []) as Permission[] | "*",
    scope: (role?.scope ?? "own") as DataScope,
    modules: (sub?.modules ?? []) as ModuleKey[],
    company: { id: company.id, name: company.name, slug: company.slug, status: company.status, logoUrl: company.logoUrl, onboardingStatus: company.onboardingStatus },
  };
}

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    let payload: AccessPayload;
    try { payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AccessPayload; }
    catch { throw unauthorized("Session expired, please login again"); }
    const user = await buildAuthUser(payload.sub);
    if (!user) throw unauthorized("Account is inactive");
    req.user = user;
    next();
  } catch (e) { next(e); }
};

export const requireSuperAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.type !== "super_admin") return next(forbidden("Super Admin access only"));
  next();
};
