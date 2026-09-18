import { and, eq, gte, lte, inArray, isNull, or, sql, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { attendance, attendanceLogs, attendanceLive, employees, employeeShifts, shifts, holidays, companies, branches } from "../../db/schema.js";
import { computeDay, captureWindow, addDays, ymd, type ShiftCfg } from "./processor.js";
import { emitToCompany } from "../../sockets.js";
import { emitEvent } from "../automation/engine.js";
import { notify } from "../notifications/notify.service.js";
import { badRequest, conflict, forbidden } from "../../common/errors.js";

// ---------- Settings (Section 19/36/37): stored under companies.settings.attendance, ----------
// ---------- with an optional per-branch override under branches.settings ----------
export type AttendanceSettings = {
  selfCheckInEnabled: boolean;
  selfieRequired: boolean;
  gpsRequired: boolean;
  defaultGeofenceRadiusM: number;
  gpsAccuracyLimitM: number;
  activityTrackingEnabled: boolean;
  autoInactivityPauseEnabled: boolean;
  inactivityThresholdMinutes: number;
  manualBreakEnabled: boolean;
  autoCheckoutEnabled: boolean;
  allowMultiDeviceSessions: boolean;
};
// Self check-in already existed and was always-on before this feature — default stays true so
// existing companies see no behaviour change; everything else defaults OFF per the spec.
export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  selfCheckInEnabled: true, selfieRequired: false, gpsRequired: false,
  defaultGeofenceRadiusM: 50, gpsAccuracyLimitM: 50,
  activityTrackingEnabled: false, autoInactivityPauseEnabled: false, inactivityThresholdMinutes: 5,
  manualBreakEnabled: true, autoCheckoutEnabled: false, allowMultiDeviceSessions: false,
};
export async function attendanceSettingsFor(companyId: string): Promise<AttendanceSettings> {
  const [c] = await db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, companyId)).limit(1);
  return { ...DEFAULT_ATTENDANCE_SETTINGS, ...((c?.settings as { attendance?: Partial<AttendanceSettings> } | null)?.attendance ?? {}) };
}
export async function saveAttendanceSettings(companyId: string, patch: Partial<AttendanceSettings>) {
  const [c] = await db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, companyId)).limit(1);
  const merged = { ...DEFAULT_ATTENDANCE_SETTINGS, ...((c?.settings as { attendance?: Partial<AttendanceSettings> } | null)?.attendance ?? {}), ...patch };
  await db.update(companies).set({ settings: { ...(c?.settings as object), attendance: merged }, updatedAt: new Date() }).where(eq(companies.id, companyId));
  return merged;
}
export async function effectiveSettings(companyId: string, branchId: string): Promise<AttendanceSettings> {
  const base = await attendanceSettingsFor(companyId);
  const [br] = await db.select({ settings: branches.settings }).from(branches).where(eq(branches.id, branchId)).limit(1);
  return { ...base, ...((br?.settings as Partial<AttendanceSettings> | null) ?? {}) };
}

// Haversine distance in meters — used to validate a claimed GPS position against the branch's
// registered location server-side (Section 3/25/26: never trust a distance the client computes).
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function companyTz(companyId: string) {
  const [c] = await db.select({ tz: companies.timezone }).from(companies).where(eq(companies.id, companyId)).limit(1);
  return c?.tz ?? "Asia/Kolkata";
}

// Employee ka shift on a date: employee_shifts (effective) → branch default → company default
export async function resolveShift(companyId: string, employeeId: string, branchId: string, date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const [assigned] = await db.select({ s: shifts }).from(employeeShifts).innerJoin(shifts, eq(shifts.id, employeeShifts.shiftId))
    .where(and(eq(employeeShifts.employeeId, employeeId), lte(employeeShifts.effectiveFrom, d), or(isNull(employeeShifts.effectiveTo), gte(employeeShifts.effectiveTo, d)))).orderBy(desc(employeeShifts.effectiveFrom)).limit(1);
  if (assigned) return assigned.s;
  const [branchDefault] = await db.select().from(shifts).where(and(eq(shifts.companyId, companyId), eq(shifts.branchId, branchId), eq(shifts.isDefault, true))).limit(1);
  if (branchDefault) return branchDefault;
  const [companyDefault] = await db.select().from(shifts).where(and(eq(shifts.companyId, companyId), isNull(shifts.branchId), eq(shifts.isDefault, true))).limit(1);
  if (companyDefault) return companyDefault;
  const [any] = await db.select().from(shifts).where(and(eq(shifts.companyId, companyId), eq(shifts.isActive, true))).limit(1);
  return any ?? null;
}

// Leave hook — Phase 6 mein leave_requests se replace hoga
import { leaveFor } from "../leaves/leave.hook.js";
export const leaveStatusFor = leaveFor;

export async function processEmployeeDay(companyId: string, employeeId: string, date: string) {
  const [emp] = await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId))).limit(1);
  if (!emp) return null;
  const [existing] = await db.select().from(attendance).where(and(eq(attendance.employeeId, employeeId), eq(attendance.date, date))).limit(1);
  if (existing?.isManual) return existing; // HR regularised — processor override nahi karega
  const tz = await companyTz(companyId);
  const shift = await resolveShift(companyId, employeeId, emp.branchId, date);
  if (!shift) return null;
  const cfg: ShiftCfg = { ...shift, weekOffDays: shift.weekOffDays as number[] };
  const { from, to } = captureWindow(date, cfg, tz);
  const logs = await db.select().from(attendanceLogs).where(and(eq(attendanceLogs.employeeId, employeeId), gte(attendanceLogs.punchedAt, from), lte(attendanceLogs.punchedAt, to))).orderBy(attendanceLogs.punchedAt);
  const hol = await db.select().from(holidays).where(and(eq(holidays.companyId, companyId), eq(holidays.date, date), or(isNull(holidays.branchId), eq(holidays.branchId, emp.branchId)), eq(holidays.isOptional, false))).limit(1);
  const lv = await leaveStatusFor(companyId, employeeId, date);
  const c = computeDay(logs.map((l) => ({ at: l.punchedAt, direction: l.direction as any })), cfg, { date, tz, isHoliday: hol.length > 0, isOnLeave: lv.onLeave, isHalfDayLeave: lv.halfDay, isWfh: lv.wfh });
  const row = { companyId, branchId: emp.branchId, employeeId, date, shiftId: shift.id, status: c.status as any, checkIn: c.checkIn, checkOut: c.checkOut, workMinutes: c.workMinutes, breakMinutes: c.breakMinutes, lateMinutes: c.lateMinutes, earlyOutMinutes: c.earlyOutMinutes, overtimeMinutes: c.overtimeMinutes, punchCount: c.punchCount, source: (logs[0]?.source ?? null) as any, updatedAt: new Date() };
  const [saved] = await db.insert(attendance).values(row).onConflictDoUpdate({ target: [attendance.employeeId, attendance.date], set: row }).returning();
  if (existing?.status !== saved.status && (saved.status === "late" || saved.status === "absent")) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(attendance).where(and(eq(attendance.employeeId, employeeId), eq(attendance.status, saved.status), gte(attendance.date, `${date.slice(0, 7)}-01`), lte(attendance.date, date)));
    emitEvent(saved.status === "late" ? "attendance.late" : "attendance.absent", { companyId, employeeId, date, lateMinutes: saved.lateMinutes, lateCountThisMonth: n, absentCountThisMonth: n });
  }
  return saved;
}

// Process a whole company-day (or list of employees). Absent rows bhi banate hain taaki reports poore hon.
export async function processCompanyDate(companyId: string, date: string, employeeIds?: string[]) {
  const emps = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.status} not in ('resigned','terminated','inactive')`, lte(sql`${employees.joiningDate}::date`, sql`${date}::date`), employeeIds ? inArray(employees.id, employeeIds) : undefined));
  let n = 0;
  for (const e of emps) { if (await processEmployeeDay(companyId, e.id, date)) n++; }
  emitToCompany(companyId, "attendance:processed", { date, count: n });
  return n;
}

// Punch aane par: employee ki aaj + kal (night shift) dono dates process
export async function reprocessAroundPunch(companyId: string, employeeId: string, punchedAt: Date) {
  const tz = await companyTz(companyId);
  const d = ymd(punchedAt, tz);
  for (const date of [addDays(d, -1), d]) await processEmployeeDay(companyId, employeeId, date);
  emitToCompany(companyId, "attendance:new", { employeeId, punchedAt });
}

// ---------- Self-service work sessions (Sections 1-13, 24-30) ----------
// Design note: attendanceLive is a per-employee "what's happening right now" pointer, kept only
// for O(1) live-dashboard/heartbeat lookups. It is NOT the source of truth for time totals —
// every state change also writes a normal attendanceLogs row (direction in/out, breakReason set
// only on a break-start "out"), so the existing in/out pairing in processor.ts computes exact
// session/break/active minutes with zero changes to that logic (Section 50.6: reuse, don't
// duplicate). A trailing "on break, never resumed" period is intentionally left uncounted rather
// than fabricated — checkOut in that case is simply the break-start time, which is accurate.
export type BreakReason = "inactivity" | "manual" | "lunch" | "personal" | "system";
export type PunchInput = { latitude?: number; longitude?: number; accuracy?: number; selfieUrl?: string };
type Employee = typeof employees.$inferSelect;
type Branch = typeof branches.$inferSelect;

export async function currentLive(employeeId: string) {
  const [row] = await db.select().from(attendanceLive).where(eq(attendanceLive.employeeId, employeeId)).limit(1);
  return row ?? null;
}

async function classifyAndValidate(settings: AttendanceSettings, branch: Branch, input: PunchInput) {
  const needsGps = settings.gpsRequired || settings.selfieRequired || (branch.latitude != null && branch.longitude != null);
  let source: "web" | "gps" | "selfie" = "web";
  let distance: number | null = null;
  if (needsGps) {
    if (input.latitude === undefined || input.longitude === undefined) throw badRequest("Location is required for attendance", "LOCATION_REQUIRED");
    if (input.accuracy !== undefined && input.accuracy > settings.gpsAccuracyLimitM) {
      throw badRequest("Unable to verify your location accurately. Please try again.", "GPS_ACCURACY_LOW");
    }
    if (branch.latitude != null && branch.longitude != null) {
      const radius = branch.geofenceRadiusM ?? settings.defaultGeofenceRadiusM;
      distance = distanceM(input.latitude, input.longitude, Number(branch.latitude), Number(branch.longitude));
      if (distance > radius) throw forbidden("You are outside the permitted attendance location.");
    }
    source = "gps";
  }
  if (settings.selfieRequired && !input.selfieUrl) throw badRequest("A selfie is required for attendance", "SELFIE_REQUIRED");
  if (input.selfieUrl) source = "selfie";
  return { source, distance };
}

async function insertSelfLog(emp: Employee, direction: "in" | "out", opts: { source?: "web" | "gps" | "selfie"; input?: PunchInput; distance?: number | null; breakReason?: BreakReason; actorId: string; ip?: string }) {
  const now = new Date();
  const [log] = await db.insert(attendanceLogs).values({
    companyId: emp.companyId, branchId: emp.branchId, employeeId: emp.id, punchedAt: now, direction, source: opts.source ?? "web",
    latitude: opts.input?.latitude?.toString(), longitude: opts.input?.longitude?.toString(), gpsAccuracyM: opts.input?.accuracy?.toString(),
    distanceM: opts.distance != null ? String(Math.round(opts.distance)) : undefined, selfieUrl: opts.input?.selfieUrl, breakReason: opts.breakReason,
    ip: opts.ip, dedupeKey: `${emp.id}|${Math.floor(now.getTime() / 60000)}`, createdBy: opts.actorId,
  }).onConflictDoNothing().returning();
  if (!log) throw conflict("Already punched this minute", "DUPLICATE_PUNCH");
  await reprocessAroundPunch(emp.companyId, emp.id, now);
  return { log, now };
}

async function setLive(emp: Employee, status: "working" | "break" | "offline", breakReason: BreakReason | null, since: Date | null, activity: Date | null) {
  const updatedAt = new Date();
  await db.insert(attendanceLive).values({ employeeId: emp.id, companyId: emp.companyId, branchId: emp.branchId, status, breakReason, since, lastActivityAt: activity, updatedAt })
    .onConflictDoUpdate({ target: attendanceLive.employeeId, set: { companyId: emp.companyId, branchId: emp.branchId, status, breakReason, since, lastActivityAt: activity, updatedAt } });
  emitToCompany(emp.companyId, "attendance:live", { employeeId: emp.id, status, breakReason });
}

export async function selfCheckin(emp: Employee, branch: Branch, input: PunchInput, actorId: string, ip?: string) {
  const settings = await effectiveSettings(emp.companyId, emp.branchId);
  if (!settings.selfCheckInEnabled) throw forbidden("Self check-in is disabled for your company");
  const live = await currentLive(emp.id);
  if (live && live.status !== "offline" && !settings.allowMultiDeviceSessions) throw conflict("You already have an active work session.", "ALREADY_CHECKED_IN");
  const { source, distance } = await classifyAndValidate(settings, branch, input);
  const { log, now } = await insertSelfLog(emp, "in", { source, input, distance, actorId, ip });
  await setLive(emp, "working", null, now, now);
  emitEvent("attendance.checkin", { companyId: emp.companyId, employeeId: emp.id });
  return log;
}

export async function selfCheckout(emp: Employee, actorId: string) {
  const live = await currentLive(emp.id);
  if (!live || live.status === "offline") throw badRequest("You are not checked in");
  if (live.status === "working") await insertSelfLog(emp, "out", { actorId });
  // else on break — the break-start punch already recorded the effective checkout time.
  await setLive(emp, "offline", null, null, null);
  emitEvent("attendance.checkout", { companyId: emp.companyId, employeeId: emp.id });
}

async function beginBreak(emp: Employee, reason: BreakReason, actorId: string) {
  const live = await currentLive(emp.id);
  if (!live || live.status !== "working") throw badRequest("You must be checked in and working to start a break");
  const { log, now } = await insertSelfLog(emp, "out", { breakReason: reason, actorId });
  await setLive(emp, "break", reason, now, null);
  return log;
}
export async function selfBreakStart(emp: Employee, reason: Exclude<BreakReason, "inactivity" | "system">, actorId: string) {
  const settings = await effectiveSettings(emp.companyId, emp.branchId);
  if (!settings.manualBreakEnabled) throw forbidden("Breaks are disabled for your company");
  return beginBreak(emp, reason, actorId);
}
export async function selfResumeWork(emp: Employee, actorId: string) {
  const live = await currentLive(emp.id);
  if (!live || live.status !== "break") throw badRequest("You are not on a break");
  const { log, now } = await insertSelfLog(emp, "in", { actorId });
  await setLive(emp, "working", null, now, now);
  emitEvent("attendance.resumed", { companyId: emp.companyId, employeeId: emp.id });
  return log;
}
export async function selfHeartbeat(emp: Employee) {
  await db.update(attendanceLive).set({ lastActivityAt: new Date() }).where(and(eq(attendanceLive.employeeId, emp.id), eq(attendanceLive.status, "working")));
}

// ---------- Background jobs (Section 8/9) ----------
// Every 1 minute: employees "working" with a stale heartbeat get auto-paused, exactly like a
// manual break, just with reason="inactivity" — same log/live-state machinery, nothing duplicated.
export async function runInactivityAutoPause() {
  const cos = await db.select({ id: companies.id }).from(companies).where(sql`${companies.status} in ('active','trial')`);
  for (const c of cos) {
    const settings = await attendanceSettingsFor(c.id);
    if (!settings.activityTrackingEnabled || !settings.autoInactivityPauseEnabled) continue;
    const stale = await db.select().from(attendanceLive).where(and(eq(attendanceLive.companyId, c.id), eq(attendanceLive.status, "working"),
      sql`${attendanceLive.lastActivityAt} < now() - (${settings.inactivityThresholdMinutes} * interval '1 minute')`));
    for (const row of stale) {
      const [emp] = await db.select().from(employees).where(eq(employees.id, row.employeeId)).limit(1);
      if (!emp) continue;
      await beginBreak(emp, "inactivity", emp.id).catch((e: unknown) => console.error("auto-pause", emp.id, e));
      if (emp.userId) await notify({ companyId: c.id, userIds: [emp.userId], type: "attendance.inactivity", title: "Your work timer has been paused", body: `No activity detected for ${settings.inactivityThresholdMinutes} minutes.`, priority: "warning" });
      emitEvent("attendance.inactivity", { companyId: c.id, employeeId: emp.id });
    }
  }
}

// Safety net: a "working"/"break" live row left over from a previous calendar day (employee
// forgot to check out and never came back) is closed without fabricating any new timestamp —
// it just stops showing them as live. The actual attendance record for that old day is
// unaffected and can still be regularised by HR as today (Section 31, kept intentionally simple).
export async function runStaleLiveCleanup() {
  const rows = await db.select().from(attendanceLive).where(sql`${attendanceLive.status} != 'offline'`);
  for (const row of rows) {
    const settings = await attendanceSettingsFor(row.companyId);
    if (!settings.autoCheckoutEnabled || !row.since) continue;
    const tz = await companyTz(row.companyId);
    if (ymd(row.since, tz) !== ymd(new Date(), tz)) {
      await db.update(attendanceLive).set({ status: "offline", breakReason: null, since: null, lastActivityAt: null, updatedAt: new Date() }).where(eq(attendanceLive.employeeId, row.employeeId));
      emitToCompany(row.companyId, "attendance:live", { employeeId: row.employeeId, status: "offline" });
    }
  }
}
