import { Router } from "express";
import { z } from "zod";
import { eq, and, count, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { departments, employees } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, conflict } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant, assertBranchInTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("employees"));
const schema = z.object({ name: z.string().min(2).max(120), code: z.string().max(30).optional(), branchId: z.string().uuid().nullable().optional(), headEmployeeId: z.string().uuid().nullable().optional(), isActive: z.boolean().optional() });

r.get("/", requirePermission("department.view"), asyncHandler(async (req, res) => {
  ok(res, await db.select({ ...departments as any, employeeCount: sql<number>`(select count(*) from ${employees} where ${employees.departmentId} = ${departments.id} and ${employees.status} not in ('resigned','terminated'))`.mapWith(Number) })
    .from(departments).where(eq(departments.companyId, req.tenant!.companyId)).orderBy(departments.name));
}));
r.post("/", requirePermission("department.manage"), validate(schema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof schema>;
  if (b.branchId) await assertBranchInTenant(req, b.branchId);
  const [dupe] = await db.select().from(departments).where(and(eq(departments.companyId, req.tenant!.companyId), eq(departments.name, b.name))).limit(1);
  if (dupe) throw conflict("Department already exists");
  const [row] = await db.insert(departments).values({ ...b, companyId: req.tenant!.companyId }).returning();
  audit(req, "create", "department", row.id, { name: row.name }); created(res, row, "Department created");
}));
r.put("/:id", requirePermission("department.manage"), validate(schema.partial()), asyncHandler(async (req, res) => {
  const b = req.body as Partial<z.infer<typeof schema>>;
  if (b.branchId) await assertBranchInTenant(req, b.branchId);
  const [row] = await db.update(departments).set({ ...b, updatedAt: new Date() }).where(and(eq(departments.id, req.params.id), eq(departments.companyId, req.tenant!.companyId))).returning();
  if (!row) throw notFound("Department not found");
  audit(req, "update", "department", row.id, b); ok(res, row, "Department updated");
}));
r.delete("/:id", requirePermission("department.manage"), asyncHandler(async (req, res) => {
  const [{ n }] = await db.select({ n: count() }).from(employees).where(and(eq(employees.departmentId, req.params.id), eq(employees.companyId, req.tenant!.companyId)));
  if (n > 0) throw conflict("Department has employees. Move them first.");
  const [row] = await db.delete(departments).where(and(eq(departments.id, req.params.id), eq(departments.companyId, req.tenant!.companyId))).returning();
  if (!row) throw notFound("Department not found");
  audit(req, "delete", "department", row.id, { name: row.name }); ok(res, null, "Department deleted");
}));
export default r;
