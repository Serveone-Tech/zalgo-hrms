import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { notifications, notificationSettings, users, employees, roles } from "../../db/schema.js";
import { registerJob, enqueue } from "../../queue/index.js";
import { sendEmail, sendSms, sendWhatsApp } from "./channels.js";
import { emitToCompany } from "../../sockets.js";

// Section 95: event catalogue with defaults
export const EVENTS: Record<string, { label: string; email: boolean; sms: boolean; whatsapp: boolean }> = {
  "leave.requested": { label: "Leave requested (to manager)", email: true, sms: false, whatsapp: false },
  "leave.approved": { label: "Leave approved", email: true, sms: false, whatsapp: true },
  "leave.rejected": { label: "Leave rejected", email: true, sms: false, whatsapp: true },
  "expense.submitted": { label: "Expense submitted", email: true, sms: false, whatsapp: false },
  "expense.updated": { label: "Expense approved / rejected / paid", email: true, sms: false, whatsapp: false },
  "payroll.paid": { label: "Salary paid / payslip ready", email: true, sms: true, whatsapp: true },
  "attendance.late": { label: "Late arrival", email: false, sms: false, whatsapp: false },
  "document.expiring": { label: "Document expiring", email: true, sms: false, whatsapp: false },
  "employee.birthday": { label: "Birthday", email: false, sms: false, whatsapp: true },
  "employee.anniversary": { label: "Work anniversary", email: false, sms: false, whatsapp: false },
  "ticket.created": { label: "Help desk ticket created", email: true, sms: false, whatsapp: false },
  "ticket.updated": { label: "Ticket updated", email: true, sms: false, whatsapp: false },
  "announcement.new": { label: "Announcement", email: true, sms: false, whatsapp: false },
  "interview.scheduled": { label: "Interview scheduled (to interviewer)", email: true, sms: false, whatsapp: false },
  "subscription.expiring": { label: "Subscription expiring", email: true, sms: true, whatsapp: true },
  "branch.decided": { label: "Branch approved / rejected", email: true, sms: false, whatsapp: false },
  "automation": { label: "Automation rule actions", email: true, sms: true, whatsapp: true },
  "company.signup": { label: "New self-service signup", email: true, sms: false, whatsapp: false },
  "payment.success": { label: "Payment received", email: true, sms: false, whatsapp: false },
  "payment.failed": { label: "Payment failed", email: true, sms: false, whatsapp: false },
  "subscription.renewed": { label: "Subscription renewed", email: true, sms: false, whatsapp: false },
  "attendance.checkin": { label: "Employee checked in", email: false, sms: false, whatsapp: false },
  "attendance.checkout": { label: "Employee checked out", email: false, sms: false, whatsapp: false },
  "attendance.inactivity": { label: "Work timer auto-paused (inactivity)", email: false, sms: false, whatsapp: false },
  "attendance.correction": { label: "Attendance correction requested", email: true, sms: false, whatsapp: false },
};
export async function settingsFor(companyId: string) {
  const [s] = await db.select().from(notificationSettings).where(eq(notificationSettings.companyId, companyId)).limit(1);
  if (s) return s;
  const [n] = await db.insert(notificationSettings).values({ companyId }).onConflictDoNothing().returning();
  return n ?? (await db.select().from(notificationSettings).where(eq(notificationSettings.companyId, companyId)).limit(1))[0];
}

export type Notify = { companyId: string | null; userIds: string[]; type: string; title: string; body?: string; link?: string; priority?: "info" | "success" | "warning" | "critical"; force?: Partial<Record<"email" | "sms" | "whatsapp", boolean>> };
// Fire-and-forget: in-app row turant, external channels queue par
export async function notify(n: Notify) {
  const ids = [...new Set(n.userIds.filter(Boolean))]; if (!ids.length) return;
  const settings = n.companyId ? await settingsFor(n.companyId) : null;
  const def = EVENTS[n.type] ?? EVENTS.automation; const pref = settings?.events?.[n.type];
  const want = { email: n.force?.email ?? pref?.email ?? def.email, sms: n.force?.sms ?? pref?.sms ?? def.sms, whatsapp: n.force?.whatsapp ?? pref?.whatsapp ?? def.whatsapp };
  const channels: Record<string, "queued" | "skipped"> = { inApp: "queued" as any, email: want.email && settings?.email.enabled ? "queued" : "skipped", sms: want.sms && settings?.sms.enabled ? "queued" : "skipped", whatsapp: want.whatsapp && settings?.whatsapp.enabled ? "queued" : "skipped" };
  const rows = await db.insert(notifications).values(ids.map((userId) => ({ companyId: n.companyId, userId, type: n.type, title: n.title, body: n.body, link: n.link, priority: n.priority ?? "info", channels }))).returning();
  if (n.companyId) emitToCompany(n.companyId, "notification:new", { userIds: ids, title: n.title, priority: n.priority ?? "info" });
  for (const r of rows) if (Object.values(channels).some((c) => c === "queued")) enqueue("notification.deliver", { id: r.id });
}
registerJob("notification.deliver", async ({ id }: { id: string }) => {
  const [n] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1); if (!n || !n.companyId) return;
  const s = await settingsFor(n.companyId);
  const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, n.userId)).limit(1);
  const [e] = await db.select({ mobile: employees.mobile, email: employees.email }).from(employees).where(eq(employees.userId, n.userId)).limit(1);
  const ch = { ...n.channels }; const text = `${n.title}\n\n${n.body ?? ""}`.trim();
  const tryCh = async (k: "email" | "sms" | "whatsapp", fn: () => Promise<string>) => { if (ch[k] !== "queued") return; try { ch[k] = (await fn()) as any; } catch (err: any) { ch[k] = "failed"; console.warn(`notify ${k} failed:`, err?.message); } };
  await tryCh("email", () => sendEmail(s.email, u?.email ?? e?.email ?? "", n.title, text));
  await tryCh("sms", () => sendSms(s.sms, e?.mobile ?? "", `${n.title}: ${n.body ?? ""}`.slice(0, 300)));
  await tryCh("whatsapp", () => sendWhatsApp(s.whatsapp, e?.mobile ?? "", text));
  await db.update(notifications).set({ channels: ch }).where(eq(notifications.id, id));
});

// Helpers to resolve recipients
export async function userOfEmployee(employeeId: string) { const [e] = await db.select({ userId: employees.userId, mgr: employees.reportingManagerId }).from(employees).where(eq(employees.id, employeeId)).limit(1); return e; }
export async function managerUser(employeeId: string) { const e = await userOfEmployee(employeeId); if (!e?.mgr) return null; const m = await userOfEmployee(e.mgr); return m?.userId ?? null; }
export async function usersWithPermission(companyId: string, perm: string) {
  const rs = await db.select().from(roles).where(eq(roles.companyId, companyId));
  const ids = rs.filter((r) => r.permissions === "*" || (r.permissions as string[]).includes(perm)).map((r) => r.id);
  if (!ids.length) return [];
  return (await db.select({ id: users.id }).from(users).where(and(eq(users.companyId, companyId), eq(users.isActive, true), inArray(users.roleId, ids)))).map((u) => u.id);
}
void sql;
