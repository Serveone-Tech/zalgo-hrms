import { Router } from "express";
import { z } from "zod";
import { eq, and, count, asc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { designations, employees } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, conflict } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("employees"));
const schema = z.object({ name: z.string().min(2).max(120), level: z.coerce.number().int().min(1).max(50).default(1), isActive: z.boolean().optional() });

r.get("/", requirePermission("designation.view"), asyncHandler(async (req, res) => {
  ok(res, await db.select().from(designations).where(eq(designations.companyId, req.tenant!.companyId)).orderBy(asc(designations.level), designations.name));
}));
r.post("/", requirePermission("designation.manage"), validate(schema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof schema>;
  const [dupe] = await db.select().from(designations).where(and(eq(designations.companyId, req.tenant!.companyId), eq(designations.name, b.name))).limit(1);
  if (dupe) throw conflict("Designation already exists");
  const [row] = await db.insert(designations).values({ ...b, companyId: req.tenant!.companyId }).returning();
  audit(req, "create", "designation", row.id, { name: row.name }); created(res, row, "Designation created");
}));
r.put("/:id", requirePermission("designation.manage"), validate(schema.partial()), asyncHandler(async (req, res) => {
  const [row] = await db.update(designations).set({ ...(req.body as object), updatedAt: new Date() }).where(and(eq(designations.id, req.params.id), eq(designations.companyId, req.tenant!.companyId))).returning();
  if (!row) throw notFound("Designation not found");
  audit(req, "update", "designation", row.id, req.body as Record<string, unknown>); ok(res, row, "Designation updated");
}));
r.delete("/:id", requirePermission("designation.manage"), asyncHandler(async (req, res) => {
  const [{ n }] = await db.select({ n: count() }).from(employees).where(and(eq(employees.designationId, req.params.id), eq(employees.companyId, req.tenant!.companyId)));
  if (n > 0) throw conflict("Designation is assigned to employees.");
  const [row] = await db.delete(designations).where(and(eq(designations.id, req.params.id), eq(designations.companyId, req.tenant!.companyId))).returning();
  if (!row) throw notFound("Designation not found");
  audit(req, "delete", "designation", row.id, { name: row.name }); ok(res, null, "Designation deleted");
}));
export default r;
