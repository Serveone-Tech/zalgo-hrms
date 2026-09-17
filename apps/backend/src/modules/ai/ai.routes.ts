import { Router } from "express";
import { z } from "zod";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { employees, attendance, leaveBalances, leaveTypes, leaveRequests, payrollItems, payrollRuns, holidays, companies, departments } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { badRequest } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requireModule, hasPermission } from "../../middleware/permission.js";
import { myEmployee } from "../../common/me.js";
import { available } from "../leaves/leave.service.js";
import { audit } from "../../common/audit.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("analytics"));
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

// Context builder: sirf caller ke apne data (employee) ya aggregates (HR). Doosre employees ka personal data kabhi nahi.
async function buildContext(req: any) {
  const cid = req.tenant!.companyId; const me = await myEmployee(req); const today = new Date().toISOString().slice(0, 10); const month = today.slice(0, 7);
  const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, cid)).limit(1);
  const ctx: Record<string, unknown> = { company: co.name, today, user: { name: req.user.name, role: req.user.roleName } };
  if (me) {
    const bal = await db.select({ code: leaveTypes.code, name: leaveTypes.name, b: leaveBalances }).from(leaveBalances).innerJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId)).where(and(eq(leaveBalances.employeeId, me.id), eq(leaveBalances.year, Number(today.slice(0, 4)))));
    const att = await db.select({ status: attendance.status, n: sql<number>`count(*)`.mapWith(Number), mins: sql<number>`sum(${attendance.workMinutes})`.mapWith(Number) }).from(attendance).where(and(eq(attendance.employeeId, me.id), gte(attendance.date, `${month}-01`), lte(attendance.date, `${month}-31`))).groupBy(attendance.status);
    const lv = await db.select({ type: leaveTypes.code, from: leaveRequests.fromDate, to: leaveRequests.toDate, days: leaveRequests.days, status: leaveRequests.status }).from(leaveRequests).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId)).where(eq(leaveRequests.employeeId, me.id)).orderBy(desc(leaveRequests.createdAt)).limit(5);
    const slips = await db.select({ month: payrollItems.month, net: payrollItems.net, gross: payrollItems.gross, lop: payrollItems.lopDays }).from(payrollItems).innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.runId)).where(and(eq(payrollItems.employeeId, me.id), eq(payrollRuns.status, "paid"))).orderBy(desc(payrollItems.month)).limit(3);
    const hol = await db.select({ name: holidays.name, date: holidays.date }).from(holidays).where(and(eq(holidays.companyId, cid), gte(holidays.date, today))).orderBy(holidays.date).limit(5);
    ctx.me = { employeeCode: me.employeeCode, joiningDate: me.joiningDate.toISOString().slice(0, 10), status: me.status, leaveBalances: bal.map((x) => ({ type: `${x.name} (${x.code})`, available: available(x.b), used: Number(x.b.used) })), attendanceThisMonth: att, recentLeaves: lv, recentPayslips: slips, upcomingHolidays: hol };
  }
  if (hasPermission(req, "report.view")) {
    const hc = await db.select({ department: sql<string>`coalesce(${departments.name},'Unassigned')`, n: sql<number>`count(*)`.mapWith(Number) }).from(employees).leftJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(employees.companyId, cid), sql`${employees.status} not in ('resigned','terminated','inactive')`)).groupBy(departments.name);
    const absent = await db.select({ department: sql<string>`coalesce(${departments.name},'Unassigned')`, absent: sql<number>`count(*) filter (where ${attendance.status}='absent')`.mapWith(Number), late: sql<number>`count(*) filter (where ${attendance.status}='late')`.mapWith(Number), total: sql<number>`count(*)`.mapWith(Number) }).from(attendance).innerJoin(employees, eq(employees.id, attendance.employeeId)).leftJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(attendance.companyId, cid), gte(attendance.date, `${month}-01`))).groupBy(departments.name);
    const pend = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(leaveRequests).where(and(eq(leaveRequests.companyId, cid), sql`${leaveRequests.status} in ('pending','manager_approved')`));
    const pay = await db.select({ month: payrollRuns.month, net: payrollRuns.totalNet, status: payrollRuns.status, employees: payrollRuns.employeeCount }).from(payrollRuns).where(eq(payrollRuns.companyId, cid)).orderBy(desc(payrollRuns.month)).limit(3);
    ctx.hrAnalytics = { headcountByDepartment: hc, attendanceThisMonthByDepartment: absent, pendingLeaveRequests: pend[0]?.n ?? 0, recentPayrollRuns: pay };
  }
  return ctx;
}

r.post("/ask", validate(z.object({ question: z.string().min(2).max(2000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(10).default([]) })), asyncHandler(async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw badRequest("AI assistant is not configured. Set ANTHROPIC_API_KEY in apps/backend/.env", "AI_NOT_CONFIGURED");
  const { question, history } = req.body as { question: string; history: { role: "user" | "assistant"; content: string }[] };
  const ctx = await buildContext(req);
  const system = `You are the HR assistant inside Zalgo HRMS for the company "${ctx.company}". Answer only from the JSON context below; if the answer is not in the context, say so and suggest which HRMS screen to check. Be concise, use Indian date and currency formats, and reply in the language the user writes in (English or Hinglish). Never reveal data about other individual employees unless it is in the hrAnalytics aggregates.\n\nCONTEXT:\n${JSON.stringify(ctx)}`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 800, system, messages: [...history, { role: "user", content: question }] }) });
  if (!resp.ok) throw badRequest(`AI request failed (${resp.status})`);
  const data = await resp.json() as { content: { type: string; text?: string }[] };
  const answer = data.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  audit(req, "ask", "ai_assistant", null, { q: question.slice(0, 200) });
  ok(res, { answer });
}));
r.get("/status", asyncHandler(async (_req, res) => { ok(res, { configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL }); }));
export default r;
