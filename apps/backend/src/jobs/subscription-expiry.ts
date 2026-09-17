import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { subscriptions, companies } from "../db/schema.js";
import { emitToCompany, emitToPlatform } from "../sockets.js";
import { createInvoice } from "../modules/subscriptions/invoice.service.js";

const DAY = 86400000;
// Section 125: har ghante check — 7/3/1 din pehle notify, endsAt par renewal invoice + past_due, grace ke baad expired.
export async function runSubscriptionExpiryCheck() {
  const now = new Date();
  const live = await db.select().from(subscriptions).where(sql`${subscriptions.status} in ('active','trial','past_due','pending_payment')`);
  for (const s of live) {
    const daysLeft = Math.ceil((s.endsAt.getTime() - now.getTime()) / DAY);
    if ([7, 3, 1].includes(daysLeft)) { emitToCompany(s.companyId, "subscription:expiring", { daysLeft, endsAt: s.endsAt }); await notify({ companyId: s.companyId, userIds: await usersWithPermission(s.companyId, "company.settings"), type: "subscription.expiring", title: `Subscription expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, body: "Contact Zalgo Infotech to renew and avoid interruption.", link: "/app/subscription", priority: daysLeft <= 3 ? "critical" : "warning" }); emitEvent("subscription.expiring", { companyId: s.companyId, daysLeft }); }
    if (daysLeft <= 0 && s.status === "active") {
      await db.update(subscriptions).set({ status: "past_due", updatedAt: now }).where(eq(subscriptions.id, s.id));
      await createInvoice(s.companyId, "renewal", "Auto-generated renewal invoice", { periodStart: s.endsAt, periodEnd: new Date(s.endsAt.getTime() + (s.billingCycle === "yearly" ? 365 : 30) * DAY) });
      emitToPlatform("subscription:past_due", { companyId: s.companyId });
    }
    if (now.getTime() > s.endsAt.getTime() + s.gracePeriodDays * DAY) {
      await db.update(subscriptions).set({ status: "expired", updatedAt: now }).where(eq(subscriptions.id, s.id));
      await db.update(companies).set({ status: "expired", updatedAt: now }).where(and(eq(companies.id, s.companyId), sql`${companies.status} in ('active','trial')`));
      emitToCompany(s.companyId, "subscription:expired", {}); emitToPlatform("subscription:expired", { companyId: s.companyId });
    }
  }
}
import { processCompanyDate } from "../modules/attendance/attendance.service.js";
import { ymd, addDays } from "../modules/attendance/processor.js";
// Section 109: daily attendance processing — har company ke liye kal + aaj (night shifts ke liye)
export async function runAttendanceProcessing() {
  const cos = await db.select({ id: companies.id, tz: companies.timezone }).from(companies).where(sql`${companies.status} in ('active','trial')`);
  for (const c of cos) { const today = ymd(new Date(), c.tz); for (const d of [addDays(today, -1), today]) await processCompanyDate(c.id, d).catch((e) => console.error("attendance job", c.id, e)); }
}
import { devices } from "../db/schema.js";
// Section 54: heartbeat 3 min se purana → offline
export async function runDeviceOfflineCheck() {
  const stale = await db.select().from(devices).where(and(sql`${devices.status} in ('online','syncing')`, sql`coalesce(${devices.lastHeartbeatAt}, ${devices.updatedAt}) < now() - interval '3 minutes'`));
  for (const d of stale) { await db.update(devices).set({ status: "offline", updatedAt: new Date() }).where(eq(devices.id, d.id)); emitToCompany(d.companyId, "device:offline", { deviceId: d.id, name: d.name, status: "offline" }); }
}
import { accrueForCompany } from "../modules/leaves/leave.service.js";
// Leave accrual: daily (idempotent — monthly/yearly credits once)
export async function runLeaveAccrual() {
  const cos = await db.select({ id: companies.id }).from(companies).where(sql`${companies.status} in ('active','trial')`);
  for (const c of cos) await accrueForCompany(c.id).catch((e) => console.error("leave accrual", c.id, e));
}
import { employeeDocuments, employees, users } from "../db/schema.js";
import { notify, usersWithPermission } from "../modules/notifications/notify.service.js";
import { emitEvent } from "../modules/automation/engine.js";
import { gte, lte, isNull, or } from "drizzle-orm";
let lastDaily = "";
// Section 95/109: document expiry (30/7/1 days), birthdays, anniversaries — once per day
export async function runDailyEvents() {
  const today = new Date().toISOString().slice(0, 10); if (lastDaily === today) return; lastDaily = today;
  const cos = await db.select({ id: companies.id }).from(companies).where(sql`${companies.status} in ('active','trial')`);
  for (const c of cos) {
    const hr = await usersWithPermission(c.id, "employee.update");
    const docs = await db.select({ d: employeeDocuments, userId: employees.userId, name: sql<string>`trim(${employees.firstName}||' '||${employees.lastName})` }).from(employeeDocuments).innerJoin(employees, eq(employees.id, employeeDocuments.employeeId)).where(and(eq(employeeDocuments.companyId, c.id), gte(employeeDocuments.expiryDate, new Date(today)), lte(employeeDocuments.expiryDate, new Date(Date.now() + 31 * 86400000))));
    for (const { d, userId, name } of docs) { const left = Math.ceil((d.expiryDate!.getTime() - Date.now()) / 86400000); if ([30, 7, 1].includes(left)) { await notify({ companyId: c.id, userIds: [...hr, ...(userId ? [userId] : [])], type: "document.expiring", title: `${d.title} of ${name} expires in ${left} day${left === 1 ? "" : "s"}`, link: `/app/employees/${d.employeeId}`, priority: left <= 7 ? "warning" : "info" }); emitEvent("document.expiring", { companyId: c.id, employeeId: d.employeeId, daysLeft: left, docType: d.type }); } }
    const emps = await db.select().from(employees).where(and(eq(employees.companyId, c.id), sql`${employees.status} not in ('resigned','terminated','inactive')`));
    const all = (await db.select({ id: users.id }).from(users).where(and(eq(users.companyId, c.id), eq(users.isActive, true)))).map((u) => u.id);
    const mmdd = today.slice(5);
    for (const e of emps) {
      const nm = `${e.firstName} ${e.lastName}`.trim();
      if (e.dateOfBirth && e.dateOfBirth.toISOString().slice(5, 10) === mmdd) { await notify({ companyId: c.id, userIds: all, type: "employee.birthday", title: `🎂 Today is ${nm}'s birthday`, priority: "success" }); emitEvent("employee.birthday", { companyId: c.id, employeeId: e.id }); }
      const yrs = Number(today.slice(0, 4)) - e.joiningDate.getUTCFullYear();
      if (yrs > 0 && e.joiningDate.toISOString().slice(5, 10) === mmdd) { await notify({ companyId: c.id, userIds: all, type: "employee.anniversary", title: `🎉 ${nm} completes ${yrs} year${yrs > 1 ? "s" : ""} today`, priority: "success" }); emitEvent("employee.anniversary", { companyId: c.id, employeeId: e.id, years: yrs }); }
    }
  }
  void isNull; void or;
}
export function startJobs() {
  setTimeout(() => runDailyEvents().catch((e) => console.error("daily events", e)), 30000); setInterval(() => runDailyEvents().catch((e) => console.error("daily events", e)), 60 * 60 * 1000);
  setTimeout(() => runLeaveAccrual().catch(() => {}), 20000); setInterval(() => runLeaveAccrual().catch(() => {}), 12 * 60 * 60 * 1000);
  setInterval(() => runDeviceOfflineCheck().catch((e) => console.error("device job", e)), 60 * 1000);
  const att = () => runAttendanceProcessing().catch((e) => console.error("attendance job", e));
  setTimeout(att, 15000); setInterval(att, 30 * 60 * 1000);
  const run = () => runSubscriptionExpiryCheck().catch((e) => console.error("expiry job", e));
  setTimeout(run, 5000);
  setInterval(run, 60 * 60 * 1000);
  console.log("⏱  Jobs started: subscription expiry (hourly), attendance processing (30 min), device offline check (1 min), leave accrual (12 h), daily events (birthdays/docs)");
}
