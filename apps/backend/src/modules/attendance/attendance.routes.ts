import { Router } from "express";
import { z } from "zod";
import { and, eq, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { attendance, attendanceLogs, employees, branches, shifts, designations, departments } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, badRequest, forbidden } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule, hasPermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { employeeScopeWhere } from "../../common/scope.js";
import { fullName } from "../employees/employees.service.js";
import { processCompanyDate, processEmployeeDay, reprocessAroundPunch, companyTz } from "./attendance.service.js";
import { ymd, addDays } from "./processor.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("attendance"));
const dateRe = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const myEmployee = async (req: any) => { const [e] = await db.select().from(employees).where(and(eq(employees.companyId, req.tenant!.companyId), eq(employees.userId, req.user!.id))).limit(1); return e; };
const distanceM = (lat1: number, lon1: number, lat2: number, lon2: number) => { const R = 6371000, p = Math.PI / 180; const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2; return 2 * R * Math.asin(Math.sqrt(a)); };

// ---- Self: web/GPS/selfie punch (Section 46, 120, 121) ----
r.post("/punch", validate(z.object({ latitude: z.number().optional(), longitude: z.number().optional(), selfieUrl: z.string().url().optional(), direction: z.enum(["in", "out"]).optional() })), asyncHandler(async (req, res) => {
  const me = await myEmployee(req);
  if (!me) throw badRequest("Your login is not linked to an employee record");
  const b = req.body as { latitude?: number; longitude?: number; selfieUrl?: string; direction?: "in" | "out" };
  const [br] = await db.select().from(branches).where(eq(branches.id, me.branchId)).limit(1);
  let source: "web" | "gps" | "selfie" = "web";
  if (br?.geofenceRadiusM && br.latitude && br.longitude) {
    if (b.latitude === undefined || b.longitude === undefined) throw badRequest("Location is required for this branch", "LOCATION_REQUIRED");
    const dist = distanceM(b.latitude, b.longitude, Number(br.latitude), Number(br.longitude));
    if (dist > br.geofenceRadiusM) throw forbidden(`You are ${Math.round(dist)} m from ${br.name}; allowed radius is ${br.geofenceRadiusM} m`);
    source = "gps";
  }
  if (b.selfieUrl) source = "selfie";
  const now = new Date();
  const [log] = await db.insert(attendanceLogs).values({ companyId: me.companyId, branchId: me.branchId, employeeId: me.id, punchedAt: now, direction: b.direction ?? "unknown", source, latitude: b.latitude?.toString(), longitude: b.longitude?.toString(), selfieUrl: b.selfieUrl, ip: req.ip, dedupeKey: `${me.id}|${Math.floor(now.getTime() / 60000)}`, createdBy: req.user!.id }).onConflictDoNothing().returning();
  if (!log) throw badRequest("Already punched this minute");
  await reprocessAroundPunch(me.companyId, me.id, now);
  audit(req, "punch", "attendance_log", log.id, { source });
  created(res, log, "Punched at " + now.toLocaleTimeString("en-IN", { timeZone: await companyTz(me.companyId), hour: "2-digit", minute: "2-digit" }));
}));
r.get("/me", asyncHandler(async (req, res) => {
  const me = await myEmployee(req);
  if (!me) return ok(res, null);
  const tz = await companyTz(me.companyId); const today = ymd(new Date(), tz);
  const month = String(req.query.month ?? today.slice(0, 7));
  const rows = await db.select().from(attendance).where(and(eq(attendance.employeeId, me.id), gte(attendance.date, `${month}-01`), lte(attendance.date, `${month}-31`))).orderBy(attendance.date);
  const todayLogs = await db.select().from(attendanceLogs).where(and(eq(attendanceLogs.employeeId, me.id), gte(attendanceLogs.punchedAt, new Date(`${today}T00:00:00Z`)))).orderBy(attendanceLogs.punchedAt);
  ok(res, { employeeId: me.id, today, rows, todayLogs });
}));

// ---- Daily grid ----
r.get("/daily", requirePermission("attendance.view"), asyncHandler(async (req, res) => {
  const date = dateRe.parse(req.query.date ?? ymd(new Date(), await companyTz(req.tenant!.companyId)));
  const branchId = req.query.branchId as string | undefined; const departmentId = req.query.departmentId as string | undefined;
  const scope = await employeeScopeWhere(req, employees);
  const rows = await db.select({
    employeeId: employees.id, employeeCode: employees.employeeCode, name: fullName, branchName: branches.name, departmentName: departments.name, designationName: designations.name,
    id: attendance.id, status: attendance.status, checkIn: attendance.checkIn, checkOut: attendance.checkOut, workMinutes: attendance.workMinutes, lateMinutes: attendance.lateMinutes, overtimeMinutes: attendance.overtimeMinutes, punchCount: attendance.punchCount, isManual: attendance.isManual, source: attendance.source, remarks: attendance.remarks, shiftName: shifts.name,
  }).from(employees)
    .leftJoin(attendance, and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)))
    .leftJoin(shifts, eq(shifts.id, attendance.shiftId)).leftJoin(branches, eq(branches.id, employees.branchId)).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(designations, eq(designations.id, employees.designationId))
    .where(and(scope, sql`${employees.status} not in ('resigned','terminated','inactive')`, branchId ? eq(employees.branchId, branchId) : undefined, departmentId ? eq(employees.departmentId, departmentId) : undefined))
    .orderBy(employees.employeeCode);
  const summary = rows.reduce<Record<string, number>>((a, x) => { const k = x.status ?? "not_processed"; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  ok(res, { date, rows, summary });
}));
// ---- Monthly per employee ----
r.get("/monthly/:employeeId", requirePermission("attendance.view"), asyncHandler(async (req, res) => {
  const scope = await employeeScopeWhere(req, employees);
  const [e] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, req.params.employeeId), scope)).limit(1);
  if (!e) throw notFound("Employee not found");
  const month = z.string().regex(/^\d{4}-\d{2}$/).parse(req.query.month ?? new Date().toISOString().slice(0, 7));
  const rows = await db.select().from(attendance).where(and(eq(attendance.employeeId, e.id), gte(attendance.date, `${month}-01`), lte(attendance.date, `${month}-31`))).orderBy(attendance.date);
  const totals = rows.reduce((a, x) => ({ present: a.present + (["present", "late", "early_out", "work_from_home"].includes(x.status) ? 1 : 0), halfDay: a.halfDay + (x.status === "half_day" ? 1 : 0), absent: a.absent + (x.status === "absent" ? 1 : 0), leave: a.leave + (x.status === "on_leave" ? 1 : 0), late: a.late + (x.status === "late" ? 1 : 0), workMinutes: a.workMinutes + x.workMinutes, overtimeMinutes: a.overtimeMinutes + x.overtimeMinutes }), { present: 0, halfDay: 0, absent: 0, leave: 0, late: 0, workMinutes: 0, overtimeMinutes: 0 });
  ok(res, { month, rows, totals });
}));
// ---- Logs for an employee-day ----
r.get("/logs", requirePermission("attendance.view"), asyncHandler(async (req, res) => {
  const employeeId = z.string().uuid().parse(req.query.employeeId); const date = dateRe.parse(req.query.date);
  const scope = await employeeScopeWhere(req, employees);
  const [e] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), scope)).limit(1);
  if (!e) throw notFound("Employee not found");
  ok(res, await db.select().from(attendanceLogs).where(and(eq(attendanceLogs.employeeId, e.id), gte(attendanceLogs.punchedAt, new Date(`${addDays(date, -1)}T12:00:00Z`)), lte(attendanceLogs.punchedAt, new Date(`${addDays(date, 1)}T12:00:00Z`)))).orderBy(attendanceLogs.punchedAt));
}));

// ---- Manual punch by HR (raw log) ----
r.post("/manual-punch", requirePermission("attendance.create"), validate(z.object({ employeeId: z.string().uuid(), punchedAt: z.coerce.date(), direction: z.enum(["in", "out", "unknown"]).default("unknown"), remarks: z.string().optional() })), asyncHandler(async (req, res) => {
  const b = req.body as { employeeId: string; punchedAt: Date; direction: "in" | "out" | "unknown"; remarks?: string };
  const scope = await employeeScopeWhere(req, employees);
  const [e] = await db.select().from(employees).where(and(eq(employees.id, b.employeeId), scope)).limit(1);
  if (!e) throw notFound("Employee not found");
  const [log] = await db.insert(attendanceLogs).values({ companyId: e.companyId, branchId: e.branchId, employeeId: e.id, punchedAt: b.punchedAt, direction: b.direction, source: "manual", dedupeKey: `${e.id}|${Math.floor(b.punchedAt.getTime() / 60000)}`, createdBy: req.user!.id }).onConflictDoNothing().returning();
  if (!log) throw badRequest("A punch already exists at that minute");
  await reprocessAroundPunch(e.companyId, e.id, b.punchedAt);
  audit(req, "manual_punch", "attendance_log", log.id, { employeeId: e.id, punchedAt: b.punchedAt }); created(res, log, "Punch added");
}));
r.delete("/logs/:id", requirePermission("attendance.approve"), asyncHandler(async (req, res) => {
  const [log] = await db.delete(attendanceLogs).where(and(eq(attendanceLogs.id, req.params.id), eq(attendanceLogs.companyId, req.tenant!.companyId), inArray(attendanceLogs.source, ["manual", "web"]))).returning();
  if (!log) throw notFound("Log not found or not deletable (device logs are immutable)");
  if (log.employeeId) await reprocessAroundPunch(log.companyId, log.employeeId, log.punchedAt);
  audit(req, "delete", "attendance_log", log.id); ok(res, null, "Punch removed");
}));

// ---- Regularise (final override, Section 63 "Missing Punch") ----
r.post("/regularise", requirePermission("attendance.approve"), validate(z.object({ employeeId: z.string().uuid(), date: dateRe, status: z.enum(["present", "absent", "half_day", "late", "work_from_home", "on_leave", "holiday", "week_off"]), checkIn: z.coerce.date().optional().nullable(), checkOut: z.coerce.date().optional().nullable(), workMinutes: z.coerce.number().int().min(0).optional(), remarks: z.string().min(2) })), asyncHandler(async (req, res) => {
  const b = req.body as any;
  const scope = await employeeScopeWhere(req, employees);
  const [e] = await db.select().from(employees).where(and(eq(employees.id, b.employeeId), scope)).limit(1);
  if (!e) throw notFound("Employee not found");
  const work = b.workMinutes ?? (b.checkIn && b.checkOut ? Math.round((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 60000) : 0);
  const row = { companyId: e.companyId, branchId: e.branchId, employeeId: e.id, date: b.date, status: b.status, checkIn: b.checkIn ?? null, checkOut: b.checkOut ?? null, workMinutes: work, isManual: true, remarks: b.remarks, approvedBy: req.user!.id, source: "manual" as const, updatedAt: new Date() };
  const [saved] = await db.insert(attendance).values(row).onConflictDoUpdate({ target: [attendance.employeeId, attendance.date], set: row }).returning();
  audit(req, "regularise", "attendance", saved.id, { employeeId: e.id, date: b.date, status: b.status }); ok(res, saved, "Attendance regularised");
}));
r.post("/unlock", requirePermission("attendance.approve"), validate(z.object({ employeeId: z.string().uuid(), date: dateRe })), asyncHandler(async (req, res) => {
  const b = req.body as { employeeId: string; date: string };
  await db.update(attendance).set({ isManual: false }).where(and(eq(attendance.employeeId, b.employeeId), eq(attendance.date, b.date), eq(attendance.companyId, req.tenant!.companyId)));
  const saved = await processEmployeeDay(req.tenant!.companyId, b.employeeId, b.date);
  audit(req, "unlock", "attendance", saved?.id, b); ok(res, saved, "Recomputed from punches");
}));
// ---- Re-run processor ----
r.post("/process", requirePermission("attendance.approve"), validate(z.object({ date: dateRe, employeeIds: z.array(z.string().uuid()).optional() })), asyncHandler(async (req, res) => {
  const b = req.body as { date: string; employeeIds?: string[] };
  const n = await processCompanyDate(req.tenant!.companyId, b.date, b.employeeIds);
  audit(req, "process", "attendance", null, b); ok(res, { processed: n }, `Processed ${n} employees for ${b.date}`);
}));
void hasPermission; void desc;
export default r;
