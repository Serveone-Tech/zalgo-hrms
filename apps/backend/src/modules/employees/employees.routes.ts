import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";
import { and, eq, ilike, or, desc, count, asc, sql, aliasedTable } from "drizzle-orm";
import { db } from "../../db/index.js";
import { employees, employeeBankDetails, employeeDocuments, employeeTransfers, employeeStatusHistory, departments, designations, branches, users, roles } from "../../db/schema.js";
import { asyncHandler, validate, paginate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, conflict, badRequest, forbidden } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant, assertBranchInTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule, hasPermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { employeeScopeWhere } from "../../common/scope.js";
import { employeeSchema, bankSchema, transferSchema, statusSchema } from "./employees.schema.js";
import { assertEmployeeCapacity, nextEmployeeCode, fullName } from "./employees.service.js";
import { env } from "../../config/env.js";
import { emitEvent } from "../automation/engine.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("employees"));
const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const upload = multer({ storage: multer.diskStorage({
  destination: (req, _f, cb) => { const d = path.join(UPLOAD_ROOT, req.tenant!.companyId, "employees"); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
  filename: (_req, f, cb) => cb(null, `${crypto.randomUUID()}${path.extname(f.originalname).toLowerCase()}`),
}), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_r, f, cb) => cb(null, /^(image\/(png|jpe?g|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats.*)$/.test(f.mimetype)) });

const mgr = aliasedTable(employees, "mgr");
const listSelect = {
  id: employees.id, employeeCode: employees.employeeCode, firstName: employees.firstName, lastName: employees.lastName, name: fullName, photoUrl: employees.photoUrl,
  email: employees.email, mobile: employees.mobile, status: employees.status, employmentType: employees.employmentType, joiningDate: employees.joiningDate,
  branchId: employees.branchId, branchName: branches.name, departmentId: employees.departmentId, departmentName: departments.name,
  designationId: employees.designationId, designationName: designations.name, reportingManagerId: employees.reportingManagerId,
  managerName: sql<string>`trim(${mgr.firstName} || ' ' || ${mgr.lastName})`, userId: employees.userId, deviceUserId: employees.deviceUserId,
};
const baseQuery = () => db.select(listSelect).from(employees)
  .leftJoin(branches, eq(branches.id, employees.branchId)).leftJoin(departments, eq(departments.id, employees.departmentId))
  .leftJoin(designations, eq(designations.id, employees.designationId)).leftJoin(mgr, eq(mgr.id, employees.reportingManagerId));

async function loadScoped(req: any, id: string) {
  const scope = await employeeScopeWhere(req, employees);
  const [e] = await db.select().from(employees).where(and(eq(employees.id, id), scope)).limit(1);
  if (!e) throw notFound("Employee not found");
  return e;
}

// ---- list / org ----
r.get("/", requirePermission("employee.view"), asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query as Record<string, unknown>);
  const q = (req.query.q as string | undefined)?.trim();
  const f = (k: string) => (req.query[k] as string | undefined) || undefined;
  const where = and(await employeeScopeWhere(req, employees),
    q ? or(ilike(employees.firstName, `%${q}%`), ilike(employees.lastName, `%${q}%`), ilike(employees.employeeCode, `%${q}%`), ilike(employees.email, `%${q}%`)) : undefined,
    f("branchId") ? eq(employees.branchId, f("branchId")!) : undefined, f("departmentId") ? eq(employees.departmentId, f("departmentId")!) : undefined,
    f("status") ? eq(employees.status, f("status") as any) : undefined);
  const rows = await baseQuery().where(where).orderBy(asc(employees.employeeCode)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(employees).where(where);
  ok(res, rows, "OK", { page, limit, total });
}));
r.get("/org-tree", requirePermission("employee.view"), asyncHandler(async (req, res) => {
  const rows = await baseQuery().where(and(await employeeScopeWhere(req, employees), sql`${employees.status} not in ('resigned','terminated')`));
  ok(res, rows);
}));
r.get("/managers", requirePermission("employee.view"), asyncHandler(async (req, res) => {
  ok(res, await db.select({ id: employees.id, name: fullName, employeeCode: employees.employeeCode }).from(employees).where(and(eq(employees.companyId, req.tenant!.companyId), sql`${employees.status} not in ('resigned','terminated')`)).orderBy(employees.firstName));
}));

// ---- create ----
r.post("/", requirePermission("employee.create"), validate(employeeSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof employeeSchema>;
  const cid = req.tenant!.companyId;
  await assertBranchInTenant(req, b.branchId);
  await assertEmployeeCapacity(cid, req.tenant!.limits.employees);
  const employeeCode = b.employeeCode?.trim() || await nextEmployeeCode(cid);
  const [dupe] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, cid), eq(employees.employeeCode, employeeCode))).limit(1);
  if (dupe) throw conflict("Employee code already exists");
  const { createLogin, ...data } = b;
  let userId: string | undefined;
  if (createLogin) {
    const [role] = await db.select().from(roles).where(and(eq(roles.id, createLogin.roleId), eq(roles.companyId, cid))).limit(1);
    if (!role) throw badRequest("Invalid role for login");
    const [du] = await db.select({ id: users.id }).from(users).where(eq(users.email, createLogin.email.toLowerCase())).limit(1);
    if (du) throw conflict("Login email already registered", "EMAIL_TAKEN");
    const [u] = await db.insert(users).values({ companyId: cid, branchId: b.branchId, roleId: role.id, type: "company_user", name: `${b.firstName} ${b.lastName}`.trim(), email: createLogin.email.toLowerCase(), passwordHash: await bcrypt.hash(createLogin.password, 12) }).returning();
    userId = u.id;
  }
  const [row] = await db.insert(employees).values({ ...data, email: data.email || null, photoUrl: data.photoUrl || null, aadhaarLast4: data.aadhaarLast4 || null, companyId: cid, employeeCode, userId }).returning();
  await db.insert(employeeStatusHistory).values({ companyId: cid, employeeId: row.id, toStatus: row.status, effectiveDate: row.joiningDate, note: "Joined", changedBy: req.user!.id });
  emitEvent("employee.joined", { companyId: cid, employeeId: row.id });
  audit(req, "create", "employee", row.id, { employeeCode, name: `${row.firstName} ${row.lastName}` });
  created(res, row, "Employee added");
}));

// ---- detail ----
r.get("/:id", requirePermission("employee.view"), asyncHandler(async (req, res) => {
  const e = await loadScoped(req, req.params.id);
  const details = await baseQuery().where(eq(employees.id, e.id));
  const detail = (details[0] ?? {}) as Record<string, unknown>;
  const [bank] = await db.select().from(employeeBankDetails).where(eq(employeeBankDetails.employeeId, e.id)).limit(1);
  const docs = await db.select().from(employeeDocuments).where(eq(employeeDocuments.employeeId, e.id)).orderBy(desc(employeeDocuments.createdAt));
  const transfers = await db.select().from(employeeTransfers).where(eq(employeeTransfers.employeeId, e.id)).orderBy(desc(employeeTransfers.transferDate));
  const history = await db.select().from(employeeStatusHistory).where(eq(employeeStatusHistory.employeeId, e.id)).orderBy(desc(employeeStatusHistory.effectiveDate));
  const reports = await db.select({ id: employees.id, name: fullName, designationName: designations.name }).from(employees).leftJoin(designations, eq(designations.id, employees.designationId)).where(eq(employees.reportingManagerId, e.id));
  ok(res, { ...e, ...detail, bank: bank ?? null, documents: docs, transfers, history, reports });
}));

// ---- update ----
r.put("/:id", requirePermission("employee.update"), validate(employeeSchema.partial().omit({ createLogin: true, status: true, branchId: true })), asyncHandler(async (req, res) => {
  const e = await loadScoped(req, req.params.id);
  const b = req.body as Record<string, unknown>;
  if (b.employeeCode && b.employeeCode !== e.employeeCode) {
    const [dupe] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, e.companyId), eq(employees.employeeCode, b.employeeCode as string))).limit(1);
    if (dupe) throw conflict("Employee code already exists");
  }
  if (b.reportingManagerId === e.id) throw badRequest("Employee cannot report to themselves");
  const [row] = await db.update(employees).set({ ...b, email: (b.email as string) || null, photoUrl: (b.photoUrl as string) || null, updatedAt: new Date() } as any).where(eq(employees.id, e.id)).returning();
  audit(req, "update", "employee", row.id, b); ok(res, row, "Employee updated");
}));
r.put("/:id/bank", requirePermission("employee.update"), validate(bankSchema), asyncHandler(async (req, res) => {
  const e = await loadScoped(req, req.params.id);
  const b = req.body as z.infer<typeof bankSchema>;
  const [row] = await db.insert(employeeBankDetails).values({ ...b, companyId: e.companyId, employeeId: e.id }).onConflictDoUpdate({ target: employeeBankDetails.employeeId, set: { ...b, updatedAt: new Date() } }).returning();
  audit(req, "update", "employee_bank", e.id); ok(res, row, "Bank details saved");
}));
r.post("/:id/status", requirePermission("employee.update"), validate(statusSchema), asyncHandler(async (req, res) => {
  const e = await loadScoped(req, req.params.id);
  const b = req.body as z.infer<typeof statusSchema>;
  const exit = ["resigned", "terminated"].includes(b.status) ? (b.effectiveDate ?? new Date()) : null;
  const [row] = await db.update(employees).set({ status: b.status, exitDate: exit, updatedAt: new Date() }).where(eq(employees.id, e.id)).returning();
  await db.insert(employeeStatusHistory).values({ companyId: e.companyId, employeeId: e.id, fromStatus: e.status, toStatus: b.status, effectiveDate: b.effectiveDate ?? new Date(), note: b.note, changedBy: req.user!.id });
  if (exit && e.userId) await db.update(users).set({ isActive: false }).where(eq(users.id, e.userId));
  if (exit) emitEvent("employee.exit", { companyId: e.companyId, employeeId: e.id, status: b.status });
  audit(req, "status_change", "employee", e.id, { from: e.status, to: b.status }); ok(res, row, `Employee marked ${b.status.replace("_", " ")}`);
}));
// Section 40: transfer
r.post("/:id/transfer", requirePermission("employee.update"), validate(transferSchema), asyncHandler(async (req, res) => {
  const e = await loadScoped(req, req.params.id);
  const b = req.body as z.infer<typeof transferSchema>;
  const target = await assertBranchInTenant(req, b.toBranchId);
  if (target.status !== "active") throw badRequest("Target branch is not active");
  if (b.toBranchId === e.branchId && (b.toDepartmentId ?? e.departmentId) === e.departmentId) throw badRequest("Nothing to transfer");
  const [t] = await db.insert(employeeTransfers).values({ companyId: e.companyId, employeeId: e.id, fromBranchId: e.branchId, toBranchId: b.toBranchId, fromDepartmentId: e.departmentId, toDepartmentId: b.toDepartmentId ?? e.departmentId, transferDate: b.transferDate, reason: b.reason, approvedBy: req.user!.id }).returning();
  await db.update(employees).set({ branchId: b.toBranchId, departmentId: b.toDepartmentId ?? e.departmentId, updatedAt: new Date() }).where(eq(employees.id, e.id));
  if (e.userId) await db.update(users).set({ branchId: b.toBranchId }).where(eq(users.id, e.userId));
  audit(req, "transfer", "employee", e.id, { from: e.branchId, to: b.toBranchId }); ok(res, t, "Employee transferred");
}));
r.delete("/:id", requirePermission("employee.delete"), asyncHandler(async (req, res) => {
  const e = await loadScoped(req, req.params.id);
  await db.delete(employees).where(eq(employees.id, e.id));
  if (e.userId) await db.update(users).set({ isActive: false }).where(eq(users.id, e.userId));
  audit(req, "delete", "employee", e.id, { employeeCode: e.employeeCode }); ok(res, null, "Employee deleted");
}));

// ---- documents (Section 44, 108) ----
r.post("/:id/documents", requirePermission("employee.update"), upload.single("file"), asyncHandler(async (req, res) => {
  const e = await loadScoped(req, req.params.id);
  if (!req.file) throw badRequest("File is required (pdf, image, doc)");
  const type = String(req.body.type || "other"); const title = String(req.body.title || req.file.originalname);
  const expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
  const [d] = await db.insert(employeeDocuments).values({ companyId: e.companyId, employeeId: e.id, type, title, fileName: req.file.originalname, storagePath: req.file.path, mimeType: req.file.mimetype, sizeBytes: req.file.size, expiryDate, uploadedBy: req.user!.id }).returning();
  audit(req, "upload", "employee_document", d.id, { employeeId: e.id, type }); created(res, d, "Document uploaded");
}));
// Signed URL: HMAC(docId + exp) — koi bhi URL guess karke doosri company ka doc nahi khol sakta
const sign = (id: string, exp: number) => crypto.createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${id}.${exp}`).digest("hex");
r.get("/:id/documents/:docId/url", requirePermission("employee.view"), asyncHandler(async (req, res) => {
  const e = await loadScoped(req, req.params.id);
  const [d] = await db.select().from(employeeDocuments).where(and(eq(employeeDocuments.id, req.params.docId), eq(employeeDocuments.employeeId, e.id))).limit(1);
  if (!d) throw notFound("Document not found");
  const exp = Date.now() + 5 * 60 * 1000;
  ok(res, { url: `/api/v1/employees/files/${d.id}?exp=${exp}&sig=${sign(d.id, exp)}`, expiresAt: exp });
}));
r.post("/:id/documents/:docId/verify", requirePermission("employee.update"), validate(z.object({ verification: z.enum(["verified", "rejected", "pending"]) })), asyncHandler(async (req, res) => {
  const e = await loadScoped(req, req.params.id);
  const [d] = await db.update(employeeDocuments).set({ verification: (req.body as any).verification, verifiedBy: req.user!.id, verifiedAt: new Date() }).where(and(eq(employeeDocuments.id, req.params.docId), eq(employeeDocuments.employeeId, e.id))).returning();
  if (!d) throw notFound("Document not found");
  audit(req, "verify", "employee_document", d.id, { verification: d.verification }); ok(res, d, `Document ${d.verification}`);
}));
r.delete("/:id/documents/:docId", requirePermission("employee.update"), asyncHandler(async (req, res) => {
  const e = await loadScoped(req, req.params.id);
  const [d] = await db.delete(employeeDocuments).where(and(eq(employeeDocuments.id, req.params.docId), eq(employeeDocuments.employeeId, e.id))).returning();
  if (!d) throw notFound("Document not found");
  fs.rm(d.storagePath, { force: true }, () => {});
  audit(req, "delete", "employee_document", d.id); ok(res, null, "Document deleted");
}));
export default r;

// Public (signed) file route — mounted separately without tenant middleware
export const filesRouter = Router();
filesRouter.get("/:docId", asyncHandler(async (req, res) => {
  const exp = Number(req.query.exp); const sig = String(req.query.sig ?? "");
  if (!exp || exp < Date.now() || sig !== sign(req.params.docId, exp)) throw forbidden("Link expired or invalid");
  const [d] = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, req.params.docId)).limit(1);
  if (!d || !fs.existsSync(d.storagePath)) throw notFound("File not found");
  res.setHeader("Content-Type", d.mimeType ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(d.fileName)}"`);
  fs.createReadStream(d.storagePath).pipe(res);
}));
