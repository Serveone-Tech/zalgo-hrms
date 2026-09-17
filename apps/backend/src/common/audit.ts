import type { Request } from "express";
import { db } from "../db/index.js";
import { auditLogs } from "../db/schema.js";

// Rule 10: har critical action audit log hota hai. Fire-and-forget — request block nahi karta.
export const audit = (req: Request, action: string, entity: string, entityId?: string | null, details?: Record<string, unknown>) => {
  const u = req.user;
  db.insert(auditLogs).values({
    companyId: req.tenant?.companyId ?? u?.companyId ?? null,
    userId: u?.id ?? null,
    userName: u?.name ?? null,
    action, entity, entityId: entityId ?? null, details,
    ip: req.ip ?? null,
  }).catch((e: unknown) => console.error("audit log failed", e));
};
