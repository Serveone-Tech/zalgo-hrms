import type { Request, Response, NextFunction } from "express";
import { AppError } from "../common/errors.js";

export const notFoundHandler = (_req: Request, res: Response) =>
  res.status(404).json({ success: false, message: "Route not found", code: "NOT_FOUND" });

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, message: err.message, code: err.code, ...(err.details ? { errors: err.details } : {}) });
  }
  console.error("💥", err);
  return res.status(500).json({ success: false, message: "Something went wrong", code: "INTERNAL_ERROR" });
};
