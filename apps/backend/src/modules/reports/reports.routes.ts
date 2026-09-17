import { Router } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { employees, attendance, leaveRequests, leaveTypes, payrollItems, payrollRuns, branches, departments, designations, expenses, companies } from "../../db/schema.js";
import { asyncHandler } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { badRequest } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule } from "../../middleware/permission.js";
import { employeeScopeWhere } from "../../common/scope.js";
import { fullName } from "../employees/employees.service.js";
import { audit } from "../../common/audit.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("reports"), requirePermission("report.view"));
const cid = (req: any) => req.tenant!.companyId as string;
type Report = { key: string; name: string; description: string; params: ("from" | "to" | "month")[]; run: (req: any) => Promise<{ columns: string[]; rows: Record<string, any>[] }> };
const dateRe = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); const monthRe = z.string().regex(/^\d{4}-\d{2}$/);
const range = (req: any) => { const from = dateRe.parse(req.query.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)); const to = dateRe.parse(req.query.to ?? new Date().toISOString().slice(0, 10)); return { from, to }; };
const month = (req: any) => monthRe.parse(req.query.month ?? new Date().toISOString().slice(0, 7));
const filt = (req: any) => and(req.query.branchId ? eq(employees.branchId, String(req.query.branchId)) : undefined, req.query.departmentId ? eq(employees.departmentId, String(req.query.departmentId)) : undefined);
const REPORTS: Report[] = [
  { key: "employees", name: "Employee master", description: "All employees with department, designation, branch, manager and status.", params: [], run: async (req) => {
    const rows = await db.select({ "Code": employees.employeeCode, "Name": fullName, "Email": employees.email, "Mobile": employees.mobile, "Branch": branches.name, "Department": departments.name, "Designation": designations.name, "Type": employees.employmentType, "Status": employees.status, "Joined": employees.joiningDate, "Gender": employees.gender, "PAN": employees.panNumber, "UAN": employees.uanNumber }).from(employees).leftJoin(branches, eq(branches.id, employees.branchId)).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(designations, eq(designations.id, employees.designationId)).where(and(await employeeScopeWhere(req, employees), filt(req))).orderBy(employees.employeeCode);
    return { columns: Object.keys(rows[0] ?? { Code: 1 }), rows: rows.map((x) => ({ ...x, Joined: x.Joined?.toISOString().slice(0, 10) })) }; } },
  { key: "attendance-daily", name: "Daily attendance", description: "Every employee-day in the range with in/out, hours, status.", params: ["from", "to"], run: async (req) => {
    const { from, to } = range(req);
    const rows = await db.select({ "Date": attendance.date, "Code": employees.employeeCode, "Name": fullName, "Department": departments.name, "Branch": branches.name, "Status": attendance.status, "In": attendance.checkIn, "Out": attendance.checkOut, "Hours": sql<string>`round(${attendance.workMinutes}/60.0, 2)`, "Late (min)": attendance.lateMinutes, "OT (min)": attendance.overtimeMinutes, "Source": attendance.source }).from(attendance).innerJoin(employees, eq(employees.id, attendance.employeeId)).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(branches, eq(branches.id, employees.branchId)).where(and(await employeeScopeWhere(req, employees), filt(req), gte(attendance.date, from), lte(attendance.date, to))).orderBy(attendance.date, employees.employeeCode);
    return { columns: Object.keys(rows[0] ?? { Date: 1 }), rows: rows.map((x) => ({ ...x, In: x.In ? x.In.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "", Out: x.Out ? x.Out.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "" })) }; } },
  { key: "attendance-monthly", name: "Monthly attendance summary", description: "Per employee: present, absent, half days, leave, late count, hours, OT.", params: ["month"], run: async (req) => {
    const m = month(req);
    const rows = await db.select({ "Code": employees.employeeCode, "Name": fullName, "Department": departments.name, "Present": sql<number>`count(*) filter (where ${attendance.status} in ('present','late','early_out','work_from_home'))`.mapWith(Number), "Half": sql<number>`count(*) filter (where ${attendance.status} = 'half_day')`.mapWith(Number), "Absent": sql<number>`count(*) filter (where ${attendance.status} = 'absent')`.mapWith(Number), "Leave": sql<number>`count(*) filter (where ${attendance.status} = 'on_leave')`.mapWith(Number), "Late": sql<number>`count(*) filter (where ${attendance.status} = 'late')`.mapWith(Number), "Missing punch": sql<number>`count(*) filter (where ${attendance.status} = 'missing_punch')`.mapWith(Number), "Hours": sql<string>`round(sum(${attendance.workMinutes})/60.0,1)`, "OT hours": sql<string>`round(sum(${attendance.overtimeMinutes})/60.0,1)` }).from(attendance).innerJoin(employees, eq(employees.id, attendance.employeeId)).leftJoin(departments, eq(departments.id, employees.departmentId)).where(and(await employeeScopeWhere(req, employees), filt(req), gte(attendance.date, `${m}-01`), lte(attendance.date, `${m}-31`))).groupBy(employees.id, employees.employeeCode, employees.firstName, employees.lastName, departments.name).orderBy(employees.employeeCode);
    return { columns: Object.keys(rows[0] ?? { Code: 1 }), rows }; } },
  { key: "late", name: "Late arrivals", description: "Late marks in the range, with minutes late.", params: ["from", "to"], run: async (req) => {
    const { from, to } = range(req);
    const rows = await db.select({ "Date": attendance.date, "Code": employees.employeeCode, "Name": fullName, "Department": departments.name, "In": attendance.checkIn, "Late (min)": attendance.lateMinutes }).from(attendance).innerJoin(employees, eq(employees.id, attendance.employeeId)).leftJoin(departments, eq(departments.id, employees.departmentId)).where(and(await employeeScopeWhere(req, employees), filt(req), eq(attendance.status, "late"), gte(attendance.date, from), lte(attendance.date, to))).orderBy(desc(attendance.lateMinutes));
    return { columns: Object.keys(rows[0] ?? { Date: 1 }), rows: rows.map((x) => ({ ...x, In: x.In?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) })) }; } },
  { key: "overtime", name: "Overtime", description: "Overtime minutes per employee in the range.", params: ["from", "to"], run: async (req) => {
    const { from, to } = range(req);
    const rows = await db.select({ "Code": employees.employeeCode, "Name": fullName, "Department": departments.name, "Days with OT": sql<number>`count(*) filter (where ${attendance.overtimeMinutes} > 0)`.mapWith(Number), "OT hours": sql<string>`round(sum(${attendance.overtimeMinutes})/60.0,1)` }).from(attendance).innerJoin(employees, eq(employees.id, attendance.employeeId)).leftJoin(departments, eq(departments.id, employees.departmentId)).where(and(await employeeScopeWhere(req, employees), filt(req), gte(attendance.date, from), lte(attendance.date, to))).groupBy(employees.id, employees.employeeCode, employees.firstName, employees.lastName, departments.name).having(sql`sum(${attendance.overtimeMinutes}) > 0`).orderBy(sql`sum(${attendance.overtimeMinutes}) desc`);
    return { columns: Object.keys(rows[0] ?? { Code: 1 }), rows }; } },
  { key: "leave", name: "Leave report", description: "Leave requests in the range with type, days and status.", params: ["from", "to"], run: async (req) => {
    const { from, to } = range(req);
    const rows = await db.select({ "Code": employees.employeeCode, "Name": fullName, "Department": departments.name, "Type": leaveTypes.code, "From": leaveRequests.fromDate, "To": leaveRequests.toDate, "Days": leaveRequests.days, "Paid": leaveTypes.isPaid, "Status": leaveRequests.status, "Reason": leaveRequests.reason }).from(leaveRequests).innerJoin(employees, eq(employees.id, leaveRequests.employeeId)).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId)).leftJoin(departments, eq(departments.id, employees.departmentId)).where(and(await employeeScopeWhere(req, employees), filt(req), lte(leaveRequests.fromDate, to), gte(leaveRequests.toDate, from))).orderBy(desc(leaveRequests.fromDate));
    return { columns: Object.keys(rows[0] ?? { Code: 1 }), rows }; } },
  { key: "payroll", name: "Payroll register", description: "Salary register for a month: payable days, gross, each deduction, net.", params: ["month"], run: async (req) => {
    const m = month(req);
    const rows = await db.select({ it: payrollItems, code: employees.employeeCode, name: fullName, dept: departments.name, branch: branches.name, status: payrollRuns.status }).from(payrollItems).innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.runId)).innerJoin(employees, eq(employees.id, payrollItems.employeeId)).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(branches, eq(branches.id, payrollItems.branchId)).where(and(await employeeScopeWhere(req, employees), filt(req), eq(payrollItems.month, m))).orderBy(employees.employeeCode);
    const codes = [...new Set(rows.flatMap((x) => [...x.it.earnings.map((e) => "E:" + e.code), ...x.it.deductions.map((d) => "D:" + d.code)]))];
    const out = rows.map((x) => { const o: Record<string, any> = { Code: x.code, Name: x.name, Department: x.dept, Branch: x.branch, "Payable days": Number(x.it.payableDays), LOP: Number(x.it.lopDays) }; for (const c of codes) o[c.slice(2)] = c.startsWith("E:") ? x.it.earnings.find((e) => e.code === c.slice(2))?.amount ?? 0 : x.it.deductions.find((d) => d.code === c.slice(2))?.amount ?? 0; o.Gross = Number(x.it.gross); o.Deductions = Number(x.it.totalDeductions); o.Net = Number(x.it.net); o["Run status"] = x.status; return o; });
    return { columns: Object.keys(out[0] ?? { Code: 1 }), rows: out }; } },
  { key: "expenses", name: "Expense report", description: "Claims in the range with category, amount and status.", params: ["from", "to"], run: async (req) => {
    const { from, to } = range(req);
    const rows = await db.select({ "Date": expenses.expenseDate, "Code": employees.employeeCode, "Name": fullName, "Title": expenses.title, "Amount": expenses.amount, "Status": expenses.status, "Paid on": expenses.paidAt }).from(expenses).innerJoin(employees, eq(employees.id, expenses.employeeId)).where(and(await employeeScopeWhere(req, employees), filt(req), gte(expenses.expenseDate, from), lte(expenses.expenseDate, to))).orderBy(desc(expenses.expenseDate));
    return { columns: Object.keys(rows[0] ?? { Date: 1 }), rows: rows.map((x) => ({ ...x, Amount: Number(x.Amount), "Paid on": x["Paid on"]?.toISOString().slice(0, 10) ?? "" })) }; } },
  { key: "headcount", name: "Headcount by branch & department", description: "Active employees grouped by branch and department.", params: [], run: async (req) => {
    const rows = await db.select({ "Branch": branches.name, "Department": sql<string>`coalesce(${departments.name}, 'Unassigned')`, "Employees": sql<number>`count(*)`.mapWith(Number), "Full time": sql<number>`count(*) filter (where ${employees.employmentType} = 'full_time')`.mapWith(Number), "On probation": sql<number>`count(*) filter (where ${employees.status} = 'probation')`.mapWith(Number) }).from(employees).leftJoin(branches, eq(branches.id, employees.branchId)).leftJoin(departments, eq(departments.id, employees.departmentId)).where(and(await employeeScopeWhere(req, employees), sql`${employees.status} not in ('resigned','terminated','inactive')`)).groupBy(branches.name, departments.name).orderBy(branches.name);
    return { columns: Object.keys(rows[0] ?? { Branch: 1 }), rows }; } },
];
r.get("/", asyncHandler(async (_req, res) => { ok(res, REPORTS.map(({ key, name, description, params }) => ({ key, name, description, params }))); }));
r.get("/:key", asyncHandler(async (req, res) => {
  const rep = REPORTS.find((x) => x.key === req.params.key); if (!rep) throw badRequest("Unknown report");
  const data = await rep.run(req); const format = String(req.query.format ?? "json");
  if (format === "json") return ok(res, { ...data, total: data.rows.length });
  if (!(req.user!.permissions === "*" || (req.user!.permissions as string[]).includes("report.export"))) throw badRequest("Missing permission: report.export");
  audit(req, "export", "report", rep.key, { format, rows: data.rows.length });
  const fname = `${rep.key}-${new Date().toISOString().slice(0, 10)}`;
  if (format === "csv") { const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`; res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", `attachment; filename="${fname}.csv"`); return res.send([data.columns.map(esc).join(","), ...data.rows.map((r) => data.columns.map((c) => esc(r[c])).join(","))].join("\n")); }
  if (format === "xlsx") { const ws = XLSX.utils.json_to_sheet(data.rows, { header: data.columns }); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, rep.name.slice(0, 30)); const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", `attachment; filename="${fname}.xlsx"`); return res.send(buf); }
  if (format === "pdf") {
    const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, cid(req))).limit(1);
    const doc = new PDFDocument({ size: "A4", layout: data.columns.length > 7 ? "landscape" : "portrait", margin: 30 }); res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `inline; filename="${fname}.pdf"`); doc.pipe(res);
    doc.font("Helvetica-Bold").fontSize(14).text(`${co.name} — ${rep.name}`); doc.font("Helvetica").fontSize(8).fillColor("#666").text(`Generated ${new Date().toLocaleString("en-IN")} · ${data.rows.length} rows`).fillColor("#000").moveDown(0.5);
    const W = doc.page.width - 60; const cw = W / data.columns.length; let y = doc.y;
    const header = () => { doc.rect(30, y, W, 16).fill("#0E7C86"); doc.fillColor("#fff").font("Helvetica-Bold").fontSize(7); data.columns.forEach((c, i) => doc.text(c, 32 + i * cw, y + 4, { width: cw - 4, lineBreak: false })); doc.fillColor("#000").font("Helvetica"); y += 16; };
    header();
    for (const row of data.rows) { if (y > doc.page.height - 40) { doc.addPage(); y = 30; header(); } data.columns.forEach((c, i) => doc.fontSize(7).text(String(row[c] ?? ""), 32 + i * cw, y + 3, { width: cw - 4, lineBreak: false })); doc.moveTo(30, y + 14).lineTo(30 + W, y + 14).strokeColor("#ddd").lineWidth(0.5).stroke(); y += 14; }
    return doc.end();
  }
  throw badRequest("format must be json | csv | xlsx | pdf");
}));
export default r;
