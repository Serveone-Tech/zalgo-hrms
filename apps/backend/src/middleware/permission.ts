import type { Request, Response, NextFunction } from "express";
import type { Permission, ModuleKey } from "@hrms/shared-types";
import { forbidden, moduleLocked } from "../common/errors.js";

export const hasPermission = (req: Request, ...needed: Permission[]) => {
  const u = req.user;
  if (!u) return false;
  if (u.permissions === "*") return true;
  return needed.every((p) => (u.permissions as Permission[]).includes(p));
};

export const requirePermission = (...needed: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) =>
    hasPermission(req, ...needed) ? next() : next(forbidden(`Missing permission: ${needed.join(", ")}`));

// Section 24: module access backend par enforce hota hai — frontend hide karna kaafi nahi.
export const requireModule = (mod: ModuleKey) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.type === "super_admin") return next();
    if (!req.tenant?.modules.includes(mod)) return next(moduleLocked(mod));
    next();
  };
