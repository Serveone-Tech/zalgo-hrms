import { and, eq, gte, lte, or, isNull, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { leaveTypes, leaveBalances, leaveLedger, leaveRequests, employees, holidays } from "../../db/schema.js";
import { resolveShift } from "../attendance/attendance.service.js";
import { addDays } from "../attendance/processor.js";
import { badRequest } from "../../common/errors.js";

export const num = (v: string | number | null | undefined) => Number(v ?? 0);
export const available = (b: { allocated: string; carriedForward: string; adjusted: string; used: string; encashed: string }) => num(b.allocated) + num(b.carriedForward) + num(b.adjusted) - num(b.used) - num(b.encashed);

export async function getOrCreateBalance(companyId: string, employeeId: string, leaveTypeId: string, year: number) {
  const [b] = await db.select().from(leaveBalances).where(and(eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.leaveTypeId, leaveTypeId), eq(leaveBalances.year, year))).limit(1);
  if (b) return b;
  const [n] = await db.insert(leaveBalances).values({ companyId, employeeId, leaveTypeId, year }).onConflictDoNothing().returning();
  return n ?? (await db.select().from(leaveBalances).where(and(eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.leaveTypeId, leaveTypeId), eq(leaveBalances.year, year))).limit(1))[0];
}
export async function credit(companyId: string, employeeId: string, leaveTypeId: string, year: number, delta: number, kind: string, field: "allocated" | "carriedForward" | "adjusted" | "used" | "encashed", note?: string, by?: string, refId?: string) {
  const b = await getOrCreateBalance(companyId, employeeId, leaveTypeId, year);
  await db.update(leaveBalances).set({ [field]: String(num(b[field]) + delta), updatedAt: new Date() }).where(eq(leaveBalances.id, b.id));
  await db.insert(leaveLedger).values({ companyId, employeeId, leaveTypeId, year, delta: String(field === "used" || field === "encashed" ? -delta : delta), kind, note, by, refId });
}

// Working days between from..to for an employee: excludes holidays + shift week-offs (Section 66/67)
export async function workingDays(companyId: string, employeeId: string, branchId: string, from: string, to: string, halfDay?: string | null) {
  if (halfDay) return { days: 0.5, dates: [from] };
  const hols = await db.select({ date: holidays.date }).from(holidays).where(and(eq(holidays.companyId, companyId), gte(holidays.date, from), lte(holidays.date, to), or(isNull(holidays.branchId), eq(holidays.branchId, branchId)), eq(holidays.isOptional, false)));
  const hset = new Set(hols.map((h) => h.date));
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (hset.has(d)) continue;
    const shift = await resolveShift(companyId, employeeId, branchId, d);
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (shift && (shift.weekOffDays as number[]).includes(dow)) continue;
    dates.push(d);
  }
  return { days: dates.length, dates };
}

export async function overlapExists(employeeId: string, from: string, to: string, excludeId?: string) {
  const rows = await db.select({ id: leaveRequests.id }).from(leaveRequests).where(and(eq(leaveRequests.employeeId, employeeId), inArray(leaveRequests.status, ["pending", "manager_approved", "approved"]), lte(leaveRequests.fromDate, to), gte(leaveRequests.toDate, from), excludeId ? sql`${leaveRequests.id} <> ${excludeId}` : undefined)).limit(1);
  return rows.length > 0;
}

// Yearly allocation + monthly accrual (Section 109 job) — idempotent
export async function accrueForCompany(companyId: string, now = new Date()) {
  const year = now.getFullYear(); const month = now.toISOString().slice(0, 7);
  const types = await db.select().from(leaveTypes).where(and(eq(leaveTypes.companyId, companyId), eq(leaveTypes.isActive, true), sql`${leaveTypes.accrual} in ('yearly','monthly')`));
  const emps = await db.select().from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.status} not in ('resigned','terminated','inactive')`));
  let n = 0;
  for (const t of types) for (const e of emps) {
    if (t.applicableGenders?.length && (!e.gender || !t.applicableGenders.includes(e.gender))) continue;
    const b = await getOrCreateBalance(companyId, e.id, t.id, year);
    const quota = num(t.annualQuota);
    if (t.accrual === "yearly" && num(b.allocated) === 0 && quota > 0) {
      // pro-rata if joined this year
      const jm = e.joiningDate.getFullYear() === year ? e.joiningDate.getMonth() : 0;
      const alloc = Math.round((quota * (12 - jm)) / 12 * 2) / 2;
      await credit(companyId, e.id, t.id, year, alloc, "allocation", "allocated", `Annual allocation ${year}`); n++;
    }
    if (t.accrual === "monthly" && b.lastAccruedMonth !== month && quota > 0) {
      await credit(companyId, e.id, t.id, year, Math.round((quota / 12) * 100) / 100, "accrual", "allocated", `Accrual ${month}`);
      await db.update(leaveBalances).set({ lastAccruedMonth: month }).where(eq(leaveBalances.id, b.id)); n++;
    }
    // Carry forward from previous year (once, when new year balance has none)
    if (num(t.carryForwardMax) > 0 && num(b.carriedForward) === 0) {
      const [prev] = await db.select().from(leaveBalances).where(and(eq(leaveBalances.employeeId, e.id), eq(leaveBalances.leaveTypeId, t.id), eq(leaveBalances.year, year - 1))).limit(1);
      if (prev) { const cf = Math.min(num(t.carryForwardMax), Math.max(0, available(prev))); if (cf > 0) { await credit(companyId, e.id, t.id, year, cf, "carry_forward", "carriedForward", `Carried from ${year - 1}`); n++; } }
    }
  }
  return n;
}

export const assertPolicy = (t: typeof leaveTypes.$inferSelect, emp: typeof employees.$inferSelect, from: string, days: number, halfDay?: string | null) => {
  if (!t.isActive) throw badRequest("Leave type is inactive");
  if (halfDay && !t.allowHalfDay) throw badRequest(`${t.name} does not allow half-day`);
  if (!t.probationAllowed && emp.status === "probation") throw badRequest(`${t.name} is not available during probation`);
  if (t.applicableGenders?.length && (!emp.gender || !t.applicableGenders.includes(emp.gender))) throw badRequest(`${t.name} is not applicable to this employee`);
  if (t.maxConsecutiveDays && days > t.maxConsecutiveDays) throw badRequest(`Maximum ${t.maxConsecutiveDays} consecutive days for ${t.name}`);
  const notice = Math.round((new Date(`${from}T00:00:00Z`).getTime() - Date.now()) / 86400000);
  if (t.minNoticeDays > 0 && notice < t.minNoticeDays && t.code !== "SL") throw badRequest(`${t.name} needs ${t.minNoticeDays} days notice`);
};
