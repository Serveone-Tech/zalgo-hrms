import type { Response } from "express";
import type { ApiResponse } from "@hrms/shared-types";

export const ok = <T>(res: Response, data: T, message = "OK", meta?: ApiResponse["meta"]) =>
  res.json({ success: true, message, data, ...(meta ? { meta } : {}) });
export const created = <T>(res: Response, data: T, message = "Created") =>
  res.status(201).json({ success: true, message, data });
