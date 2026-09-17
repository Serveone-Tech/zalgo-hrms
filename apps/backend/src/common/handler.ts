import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodSchema } from "zod";
import { badRequest } from "./errors.js";

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export const validate = <T>(schema: ZodSchema<T>, source: "body" | "query" | "params" = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req[source]);
    if (!r.success) return next(badRequest("Validation failed", "VALIDATION_ERROR", r.error.flatten().fieldErrors));
    if (source === "body") req.body = r.data;
    else if (source === "query") req.validatedQuery = r.data as Record<string, unknown>;
    else req.params = r.data as Record<string, string>;
    next();
  };

export const paginate = (q: Record<string, unknown>) => {
  const page = Math.max(1, Number(q.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
  return { page, limit, offset: (page - 1) * limit };
};
