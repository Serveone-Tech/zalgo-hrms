import { and, eq, gte, lte, inArray, isNull, or, sql, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { attendance, attendanceLogs, employees, employeeShifts, shifts, holidays, companies } from "../../db/schema.js";
import { computeDay, captureWindow, addDays, type ShiftCfg } from "./processor.js";
import { emitToCompany } from "../../sockets.js";
import { emitEvent } from "../automation/engine.js";

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
  const { ymd } = await import("./processor.js");
  const d = ymd(punchedAt, tz);
  for (const date of [addDays(d, -1), d]) await processEmployeeDay(companyId, employeeId, date);
  emitToCompany(companyId, "attendance:new", { employeeId, punchedAt });
}
