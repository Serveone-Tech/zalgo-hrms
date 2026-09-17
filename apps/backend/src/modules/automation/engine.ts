import { and, eq, count } from "drizzle-orm";
import { db } from "../../db/index.js";
import { automationRules, automationLogs, employees, tickets } from "../../db/schema.js";
import { notify, userOfEmployee, managerUser, usersWithPermission } from "../notifications/notify.service.js";
import { enqueue, registerJob } from "../../queue/index.js";

export const TRIGGERS: Record<string, { label: string; fields: string[] }> = {
  "attendance.late": { label: "Employee marked late", fields: ["lateMinutes", "lateCountThisMonth", "departmentName", "branchName"] },
  "attendance.absent": { label: "Employee absent (no punch)", fields: ["absentCountThisMonth", "departmentName"] },
  "leave.requested": { label: "Leave requested", fields: ["days", "typeCode", "departmentName"] },
  "leave.approved": { label: "Leave approved", fields: ["days", "typeCode"] },
  "employee.joined": { label: "New employee added", fields: ["departmentName", "branchName", "employmentType"] },
  "employee.exit": { label: "Employee resigned / terminated", fields: ["status"] },
  "document.expiring": { label: "Document expiring (daily check)", fields: ["daysLeft", "docType"] },
  "expense.submitted": { label: "Expense submitted", fields: ["amount", "categoryName"] },
  "ticket.created": { label: "Help desk ticket created", fields: ["category", "priority"] },
  "subscription.expiring": { label: "Subscription expiring", fields: ["daysLeft"] },
  "employee.birthday": { label: "Employee birthday (daily)", fields: ["departmentName"] },
  "employee.anniversary": { label: "Work anniversary (daily)", fields: ["years"] },
  "payment.success": { label: "Payment received", fields: ["amount", "planName", "purpose"] },
  "payment.failed": { label: "Payment failed", fields: ["amount", "purpose"] },
};
export type EventPayload = { companyId: string; employeeId?: string; [k: string]: unknown };

const cmp = (a: any, op: string, b: any) => { const na = Number(a), nb = Number(b); const num = !isNaN(na) && !isNaN(nb) && b !== ""; switch (op) { case "eq": return num ? na === nb : String(a).toLowerCase() === String(b).toLowerCase(); case "neq": return num ? na !== nb : String(a).toLowerCase() !== String(b).toLowerCase(); case "gt": return na > nb; case "gte": return na >= nb; case "lt": return na < nb; case "lte": return na <= nb; case "contains": return String(a ?? "").toLowerCase().includes(String(b).toLowerCase()); } return false; };
const render = (t: string, p: Record<string, unknown>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => String(p[k] ?? ""));

// Public API: emitEvent(...) — any module calls this; rules run async on the queue.
export const emitEvent = (trigger: string, payload: EventPayload) => enqueue("automation.run", { trigger, payload });

registerJob("automation.run", async ({ trigger, payload }: { trigger: string; payload: EventPayload }) => {
  const rules = await db.select().from(automationRules).where(and(eq(automationRules.companyId, payload.companyId), eq(automationRules.trigger, trigger), eq(automationRules.isActive, true)));
  if (!rules.length) return;
  const p: Record<string, unknown> = { ...payload };
  if (payload.employeeId) { const [e] = await db.select().from(employees).where(eq(employees.id, payload.employeeId)).limit(1); if (e) Object.assign(p, { employeeName: `${e.firstName} ${e.lastName}`.trim(), employeeCode: e.employeeCode, branchId: e.branchId, departmentId: e.departmentId, employmentType: e.employmentType, status: e.status }); }
  for (const rule of rules) {
    const pass = rule.conditions.every((c) => cmp(p[c.field], c.op, c.value));
    let msg = pass ? "conditions matched" : "conditions not met";
    if (pass) {
      for (const a of rule.actions) {
        try {
          let userIds: string[] = [];
          if (a.to === "employee" && payload.employeeId) { const u = await userOfEmployee(payload.employeeId); if (u?.userId) userIds = [u.userId]; }
          else if (a.to === "manager" && payload.employeeId) { const m = await managerUser(payload.employeeId); if (m) userIds = [m]; }
          else if (a.to === "hr") userIds = await usersWithPermission(payload.companyId, "employee.update");
          else if (a.to === "admins") userIds = await usersWithPermission(payload.companyId, "company.settings");
          const title = render(a.template?.split("\n")[0] || `${rule.name}`, p); const body = render(a.template?.split("\n").slice(1).join("\n") || `Rule "${rule.name}" triggered by ${TRIGGERS[trigger]?.label ?? trigger}${p.employeeName ? ` for ${p.employeeName}` : ""}.`, p);
          if (a.type === "notify") await notify({ companyId: payload.companyId, userIds, type: "automation", title, body, priority: "warning" });
          if (a.type === "email" || a.type === "sms" || a.type === "whatsapp") await notify({ companyId: payload.companyId, userIds, type: "automation", title, body, priority: "warning", force: { [a.type]: true } });
          if (a.type === "create_ticket" && payload.employeeId) { const [{ n }] = await db.select({ n: count() }).from(tickets).where(eq(tickets.companyId, payload.companyId)); await db.insert(tickets).values({ companyId: payload.companyId, employeeId: payload.employeeId, number: n + 1, category: "hr", priority: "normal", subject: title, description: body }); }
          if (a.type === "webhook" && a.url) { const r = await fetch(a.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rule: rule.name, trigger, payload: p }) }); if (!r.ok) throw new Error(`webhook ${r.status}`); }
        } catch (e: any) { msg = `action ${a.type} failed: ${e?.message}`; }
      }
      await db.update(automationRules).set({ runCount: rule.runCount + 1, lastRunAt: new Date() }).where(eq(automationRules.id, rule.id));
    }
    await db.insert(automationLogs).values({ companyId: payload.companyId, ruleId: rule.id, trigger, payload: p, result: pass ? "ran" : "skipped", message: msg });
  }
});
