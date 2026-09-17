import { and, eq, lte, gte, desc, sql, inArray, isNull, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, employees, employeeSalaries, salaryComponents, salaryAdvances, payrollRuns, payrollItems, attendance, holidays, employeeBankDetails, leaveRequests, leaveTypes } from "../../db/schema.js";
import { computePay, DEFAULT_STATUTORY, type Statutory, type Component } from "./payroll.engine.js";
import { resolveShift } from "../attendance/attendance.service.js";
import { badRequest } from "../../common/errors.js";

export const num = (v: any) => Number(v ?? 0);
export async function statutoryFor(companyId: string): Promise<Statutory> {
  const [c] = await db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, companyId)).limit(1);
  const s = (c?.settings as any)?.payroll as Partial<Statutory> | undefined;
  return { ...DEFAULT_STATUTORY, ...s, pf: { ...DEFAULT_STATUTORY.pf, ...s?.pf }, esi: { ...DEFAULT_STATUTORY.esi, ...s?.esi }, pt: { ...DEFAULT_STATUTORY.pt, ...s?.pt, slabs: (s?.pt?.slabs?.map((x) => ({ upto: x.upto === null ? Infinity : x.upto, amount: x.amount })) ?? DEFAULT_STATUTORY.pt.slabs) } };
}
export const DEFAULT_COMPONENTS = [
  { code: "BASIC", name: "Basic Salary", type: "earning", calc: "fixed", defaultValue: "0", sortOrder: 1 },
  { code: "HRA", name: "House Rent Allowance", type: "earning", calc: "percent_basic", defaultValue: "40", sortOrder: 2 },
  { code: "CONV", name: "Conveyance", type: "earning", calc: "fixed", defaultValue: "1600", sortOrder: 3 },
  { code: "MED", name: "Medical Allowance", type: "earning", calc: "fixed", defaultValue: "1250", sortOrder: 4 },
  { code: "SPL", name: "Special Allowance", type: "earning", calc: "fixed", defaultValue: "0", sortOrder: 5 },
  { code: "BONUS", name: "Bonus", type: "earning", calc: "fixed", defaultValue: "0", isProrated: false, sortOrder: 6 },
  { code: "OTHER_DED", name: "Other Deduction", type: "deduction", calc: "fixed", defaultValue: "0", sortOrder: 10 },
] as const;

export async function activeSalary(employeeId: string, month: string) {
  const [s] = await db.select().from(employeeSalaries).where(and(eq(employeeSalaries.employeeId, employeeId), lte(employeeSalaries.effectiveFrom, `${month}-31`))).orderBy(desc(employeeSalaries.effectiveFrom)).limit(1);
  return s ?? null;
}
const daysIn = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
const pad = (d: number) => String(d).padStart(2, "0");

// Attendance summary → payable days (Section 72). Days without attendance row: holiday/week-off = paid, else counted by employee active window.
export async function attendanceSummary(companyId: string, emp: typeof employees.$inferSelect, month: string) {
  const dim = daysIn(month); const from = `${month}-01`, to = `${month}-${pad(dim)}`;
  const rows = await db.select().from(attendance).where(and(eq(attendance.employeeId, emp.id), gte(attendance.date, from), lte(attendance.date, to)));
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const hols = new Set((await db.select({ date: holidays.date }).from(holidays).where(and(eq(holidays.companyId, companyId), gte(holidays.date, from), lte(holidays.date, to), or(isNull(holidays.branchId), eq(holidays.branchId, emp.branchId)), eq(holidays.isOptional, false)))).map((h) => h.date));
  const unpaidLeaveDates = new Set<string>(); const halfUnpaid = new Set<string>();
  const lv = await db.select({ from: leaveRequests.fromDate, to: leaveRequests.toDate, half: leaveRequests.halfDay, paid: leaveTypes.isPaid, kind: leaveTypes.kind }).from(leaveRequests).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId)).where(and(eq(leaveRequests.employeeId, emp.id), eq(leaveRequests.status, "approved"), lte(leaveRequests.fromDate, to), gte(leaveRequests.toDate, from)));
  for (const l of lv) if (!l.paid && l.kind === "leave") for (let d = l.from < from ? from : l.from; d <= (l.to > to ? to : l.to); d = next(d)) (l.half ? halfUnpaid : unpaidLeaveDates).add(d);
  const joined = emp.joiningDate.toISOString().slice(0, 10); const exited = emp.exitDate ? emp.exitDate.toISOString().slice(0, 10) : null;
  const s = { present: 0, halfDay: 0, absent: 0, paidLeave: 0, unpaidLeave: 0, holidays: 0, weekOffs: 0, overtimeMinutes: 0, notEmployed: 0 };
  let payable = 0;
  for (let i = 1; i <= dim; i++) {
    const d = `${month}-${pad(i)}`;
    if (d < joined || (exited && d > exited)) { s.notEmployed++; continue; }
    const r = byDate.get(d);
    if (unpaidLeaveDates.has(d)) { s.unpaidLeave++; continue; }
    if (halfUnpaid.has(d)) { s.unpaidLeave += 0.5; payable += 0.5; continue; }
    if (r) {
      s.overtimeMinutes += r.overtimeMinutes;
      switch (r.status) {
        case "present": case "late": case "early_out": case "work_from_home": s.present++; payable++; break;
        case "half_day": s.halfDay++; payable += 0.5; break;
        case "on_leave": s.paidLeave++; payable++; break;
        case "holiday": s.holidays++; payable++; break;
        case "week_off": s.weekOffs++; payable++; break;
        case "missing_punch": s.halfDay++; payable += 0.5; break; // policy: missing punch = half day unless regularised
        default: s.absent++;
      }
    } else {
      if (hols.has(d)) { s.holidays++; payable++; continue; }
      const shift = await resolveShift(companyId, emp.id, emp.branchId, d); const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (shift && (shift.weekOffDays as number[]).includes(dow)) { s.weekOffs++; payable++; continue; }
      // no attendance data at all for this month → assume present (manual companies); if attendance exists for other days → absent
      if (rows.length === 0) { s.present++; payable++; } else if (d > new Date().toISOString().slice(0, 10)) { s.present++; payable++; } else { s.absent++; }
    }
  }
  return { daysInMonth: dim, payableDays: payable, lopDays: dim - s.notEmployed - payable, summary: s };
}
const next = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

export async function processRun(runId: string) {
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1);
  if (!run) throw badRequest("Run not found");
  if (["approved", "paid"].includes(run.status)) throw badRequest("Approved/paid payroll cannot be reprocessed");
  await db.update(payrollRuns).set({ status: "processing", updatedAt: new Date() }).where(eq(payrollRuns.id, run.id));
  const comps = (await db.select().from(salaryComponents).where(and(eq(salaryComponents.companyId, run.companyId), eq(salaryComponents.isActive, true)))) as unknown as Component[];
  const st = await statutoryFor(run.companyId);
  const emps = await db.select().from(employees).where(and(eq(employees.companyId, run.companyId), run.branchId ? eq(employees.branchId, run.branchId) : undefined, sql`${employees.status} not in ('inactive')`, lte(sql`${employees.joiningDate}::date`, sql`(${run.month} || '-31')::date`)));
  const held = new Map((await db.select().from(payrollItems).where(eq(payrollItems.runId, run.id))).filter((i) => i.status === "held").map((i) => [i.employeeId, i]));
  let count = 0, gross = 0, ded = 0, net = 0, cost = 0;
  for (const e of emps) {
    if (e.exitDate && e.exitDate.toISOString().slice(0, 7) < run.month) continue;
    const sal = await activeSalary(e.id, run.month); if (!sal) continue;
    const att = await attendanceSummary(run.companyId, e, run.month);
    if (att.payableDays <= 0 && att.summary.notEmployed === att.daysInMonth) continue;
    const adv = await db.select().from(salaryAdvances).where(and(eq(salaryAdvances.employeeId, e.id), eq(salaryAdvances.status, "active"), lte(salaryAdvances.startMonth, run.month)));
    const recovery = adv.reduce((a, x) => a + Math.min(num(x.installment), num(x.amount) - num(x.recovered)), 0);
    const pay = computePay({ structure: { components: sal.components, pfOptIn: sal.pfOptIn, esiOptIn: sal.esiOptIn, ptApplicable: sal.ptApplicable, tdsMonthly: num(sal.tdsMonthly) }, comps, statutory: st, daysInMonth: att.daysInMonth, payableDays: att.payableDays, advanceRecovery: recovery });
    const [bank] = await db.select().from(employeeBankDetails).where(eq(employeeBankDetails.employeeId, e.id)).limit(1);
    const row = { companyId: run.companyId, runId: run.id, employeeId: e.id, branchId: e.branchId, month: run.month, daysInMonth: att.daysInMonth, payableDays: String(att.payableDays), lopDays: String(att.lopDays), attendance: att.summary, earnings: pay.earnings, deductions: pay.deductions, employer: pay.employer, gross: String(pay.gross), totalDeductions: String(pay.totalDeductions), net: String(pay.net), employerCost: String(pay.employerCost), bankSnapshot: bank ? { bankName: bank.bankName, accountNumber: bank.accountNumber, ifsc: bank.ifsc, accountHolder: bank.accountHolder } : null, status: held.has(e.id) ? "held" : "computed", updatedAt: new Date() };
    await db.insert(payrollItems).values(row).onConflictDoUpdate({ target: [payrollItems.runId, payrollItems.employeeId], set: row });
    count++; gross += pay.gross; ded += pay.totalDeductions; net += pay.net; cost += pay.employerCost;
  }
  // remove items for employees no longer in scope
  const keep = emps.map((e) => e.id);
  if (keep.length) await db.delete(payrollItems).where(and(eq(payrollItems.runId, run.id), sql`${payrollItems.employeeId} not in (${sql.join(keep.map((k) => sql`${k}`), sql`, `)})`));
  const [u] = await db.update(payrollRuns).set({ status: "pending_approval", employeeCount: count, totalGross: String(gross), totalDeductions: String(ded), totalNet: String(net), totalEmployerCost: String(cost), processedAt: new Date(), updatedAt: new Date() }).where(eq(payrollRuns.id, run.id)).returning();
  return u;
}

export async function markPaid(runId: string) {
  const items = await db.select().from(payrollItems).where(and(eq(payrollItems.runId, runId), eq(payrollItems.status, "computed")));
  for (const it of items) {
    const rec = it.deductions.find((d) => d.code === "ADV")?.amount ?? 0;
    if (rec > 0) {
      const adv = await db.select().from(salaryAdvances).where(and(eq(salaryAdvances.employeeId, it.employeeId), eq(salaryAdvances.status, "active"))).orderBy(salaryAdvances.createdAt);
      let left = rec;
      for (const a of adv) { const due = Math.min(num(a.installment), num(a.amount) - num(a.recovered), left); if (due <= 0) continue; const recovered = num(a.recovered) + due; await db.update(salaryAdvances).set({ recovered: String(recovered), status: recovered >= num(a.amount) ? "closed" : "active" }).where(eq(salaryAdvances.id, a.id)); left -= due; if (left <= 0) break; }
    }
    await db.update(payrollItems).set({ status: "paid" }).where(eq(payrollItems.id, it.id));
  }
  void inArray;
}
