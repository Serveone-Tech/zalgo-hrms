import { Router } from "express";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { devices, deviceEmployees, deviceLogs, employees, attendanceLogs, companies } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { unauthorized, notFound } from "../../common/errors.js";
import { reprocessAroundPunch } from "../attendance/attendance.service.js";
import { emitToCompany } from "../../sockets.js";
import { fullName } from "../employees/employees.service.js";

// Section 50: Device → Agent → Backend. Agent authenticates with company agent key (x-agent-key).
const agentAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const key = req.headers["x-agent-key"] as string | undefined;
    if (!key) throw unauthorized("Agent key missing");
    const [c] = await db.select({ id: companies.id, status: companies.status }).from(companies).where(eq(companies.agentKey, key)).limit(1);
    if (!c || !["active", "trial"].includes(c.status)) throw unauthorized("Invalid agent key or company inactive");
    (req as any).agentCompanyId = c.id; next();
  } catch (e) { next(e); }
};
const r = Router();
r.use(agentAuth);
const cid = (req: Request) => (req as any).agentCompanyId as string;
const log = (companyId: string, deviceId: string, event: string, level: "info" | "warn" | "error", message?: string, details?: Record<string, unknown>) =>
  db.insert(deviceLogs).values({ companyId, deviceId, event, level, message, details }).catch(() => {});

// Agent pulls its device list
r.get("/config", asyncHandler(async (req, res) => {
  const rows = await db.select().from(devices).where(and(eq(devices.companyId, cid(req)), ne(devices.status, "disabled")));
  ok(res, rows.map((d) => ({ id: d.id, name: d.name, brand: d.brand, serial: d.serialNumber, ip: d.ipAddress, port: d.port, branchId: d.branchId, pollIntervalSec: d.pollIntervalSec, pushUsersRequested: d.pushUsersRequested })));
}));
// Heartbeat / status
r.post("/heartbeat", validate(z.object({ devices: z.array(z.object({ id: z.string().uuid(), status: z.enum(["online", "offline", "syncing", "error"]), error: z.string().optional().nullable(), userCount: z.number().int().optional(), info: z.record(z.unknown()).optional() })) })), asyncHandler(async (req, res) => {
  for (const d of (req.body as any).devices as { id: string; status: any; error?: string | null; userCount?: number }[]) {
    const [prev] = await db.select({ status: devices.status, name: devices.name }).from(devices).where(and(eq(devices.id, d.id), eq(devices.companyId, cid(req)))).limit(1);
    if (!prev) continue;
    await db.update(devices).set({ status: d.status, lastHeartbeatAt: new Date(), lastError: d.error ?? null, ...(d.userCount !== undefined ? { userCount: d.userCount } : {}), updatedAt: new Date() }).where(eq(devices.id, d.id));
    if (prev.status !== d.status) {
      await log(cid(req), d.id, "status", d.status === "error" ? "error" : "info", `${prev.status} → ${d.status}${d.error ? ": " + d.error : ""}`);
      emitToCompany(cid(req), d.status === "online" ? "device:online" : "device:offline", { deviceId: d.id, name: prev.name, status: d.status });
    }
  }
  ok(res, null);
}));
// Employees to push to a device
r.get("/devices/:id/users", asyncHandler(async (req, res) => {
  const [d] = await db.select().from(devices).where(and(eq(devices.id, req.params.id), eq(devices.companyId, cid(req)))).limit(1);
  if (!d) throw notFound("Device not found");
  const rows = await db.select({ mapId: deviceEmployees.id, deviceUserId: deviceEmployees.deviceUserId, employeeId: employees.id, name: fullName, employeeCode: employees.employeeCode }).from(deviceEmployees).innerJoin(employees, eq(employees.id, deviceEmployees.employeeId)).where(and(eq(deviceEmployees.deviceId, d.id), sql`${employees.status} not in ('resigned','terminated')`));
  ok(res, rows);
}));
r.post("/devices/:id/users-pushed", validate(z.object({ pushed: z.number().int(), failed: z.array(z.string()).default([]) })), asyncHandler(async (req, res) => {
  const b = req.body as { pushed: number; failed: string[] };
  await db.update(devices).set({ pushUsersRequested: false, lastSyncAt: new Date() }).where(and(eq(devices.id, req.params.id), eq(devices.companyId, cid(req))));
  await db.update(deviceEmployees).set({ syncedToDevice: true }).where(eq(deviceEmployees.deviceId, req.params.id));
  await log(cid(req), req.params.id, "users_pushed", b.failed.length ? "warn" : "info", `${b.pushed} users pushed${b.failed.length ? `, ${b.failed.length} failed` : ""}`, { failed: b.failed });
  ok(res, null);
}));
// Ingest punches (Section 57/58) — idempotent via dedupe key
r.post("/ingest", validate(z.object({ punches: z.array(z.object({ deviceId: z.string().uuid().optional(), deviceSerial: z.string(), deviceUserId: z.string(), punchedAt: z.coerce.date(), type: z.enum(["in", "out", "unknown"]).optional() })).min(1).max(1000) })), asyncHandler(async (req, res) => {
  const companyId = cid(req); const { punches } = req.body as { punches: { deviceId?: string; deviceSerial: string; deviceUserId: string; punchedAt: Date; type?: "in" | "out" | "unknown" }[] };
  const serials = [...new Set(punches.map((p) => p.deviceSerial))];
  const devs = await db.select().from(devices).where(and(eq(devices.companyId, companyId), inArray(devices.serialNumber, serials)));
  const bySerial = new Map(devs.map((d) => [d.serialNumber, d]));
  const maps = devs.length ? await db.select().from(deviceEmployees).where(inArray(deviceEmployees.deviceId, devs.map((d) => d.id))) : [];
  const mapKey = new Map(maps.map((m) => [`${m.deviceId}|${m.deviceUserId}`, m.employeeId]));
  const globalUids = await db.select({ id: employees.id, uid: employees.deviceUserId }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deviceUserId} is not null`));
  const globalMap = new Map(globalUids.map((e) => [e.uid!, e.id]));

  let inserted = 0, unmapped = 0, skipped = 0; const touched = new Map<string, Date>(); const unmappedIds = new Set<string>();
  for (const p of punches) {
    const d = bySerial.get(p.deviceSerial); if (!d) { skipped++; continue; }
    // Device time sanity (Section 136 "Incorrect Device Time"): future > 10 min ya 90 din purana → skip + log
    const t = p.punchedAt.getTime(); if (t > Date.now() + 10 * 60000 || t < Date.now() - 90 * 86400000) { skipped++; continue; }
    const employeeId = mapKey.get(`${d.id}|${p.deviceUserId}`) ?? globalMap.get(p.deviceUserId) ?? null;
    if (!employeeId) { unmapped++; unmappedIds.add(p.deviceUserId); }
    const source = d.type === "face" ? "face" : d.type === "rfid" ? "rfid" : "biometric";
    const [row] = await db.insert(attendanceLogs).values({ companyId, branchId: d.branchId, employeeId, deviceId: d.id, deviceUserId: p.deviceUserId, punchedAt: p.punchedAt, direction: p.type ?? "unknown", source, dedupeKey: `dev:${d.serialNumber}|${p.deviceUserId}|${Math.floor(t / 60000)}` }).onConflictDoNothing().returning();
    if (row) { inserted++; if (employeeId) { const prev = touched.get(employeeId); if (!prev || prev < p.punchedAt) touched.set(employeeId, p.punchedAt); } }
    else skipped++;
  }
  for (const d of devs) await db.update(devices).set({ lastLogAt: new Date(), lastSyncAt: new Date() }).where(eq(devices.id, d.id));
  for (const [employeeId, at] of touched) await reprocessAroundPunch(companyId, employeeId, at);
  if (devs[0]) await log(companyId, devs[0].id, "ingest", unmapped ? "warn" : "info", `${inserted} punches stored, ${skipped} duplicates/skipped, ${unmapped} unmapped`, { unmappedDeviceUserIds: [...unmappedIds].slice(0, 50) });
  ok(res, { inserted, skipped, unmapped }, "Ingested");
}));
r.post("/devices/:id/log", validate(z.object({ level: z.enum(["info", "warn", "error"]), event: z.string().max(40), message: z.string().max(2000), details: z.record(z.unknown()).optional() })), asyncHandler(async (req, res) => {
  const b = req.body as any; await log(cid(req), req.params.id, b.event, b.level, b.message, b.details); ok(res, null);
}));
export default r;
