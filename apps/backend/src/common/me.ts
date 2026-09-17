import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { employees, users } from "../db/schema.js";
export const myEmployee = async (req: Request) => { const [e] = await db.select().from(employees).where(and(eq(employees.companyId, req.tenant!.companyId), eq(employees.userId, req.user!.id))).limit(1); return e ?? null; };
export const userName = async (req: Request) => { const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, req.user!.id)).limit(1); return u?.name ?? "User"; };
