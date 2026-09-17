import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { roles, users } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, conflict, badRequest } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { PERMISSIONS, DATA_SCOPES } from "@hrms/shared-types";

const r = Router();
r.use(requireAuth, requireTenant);
const schema = z.object({
  name: z.string().min(2).max(100), description: z.string().optional(),
  scope: z.enum(DATA_SCOPES), permissions: z.array(z.enum(PERMISSIONS)),
});

r.get("/permissions", asyncHandler(async (_req, res) => { ok(res, { permissions: PERMISSIONS, scopes: DATA_SCOPES }); }));
r.get("/", requirePermission("role.view"), asyncHandler(async (req, res) => {
  ok(res, await db.select().from(roles).where(eq(roles.companyId, req.tenant!.companyId)).orderBy(roles.name));
}));
r.post("/", requirePermission("role.create"), validate(schema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof schema>;
  const [dupe] = await db.select().from(roles).where(and(eq(roles.companyId, req.tenant!.companyId), eq(roles.name, b.name))).limit(1);
  if (dupe) throw conflict("Role name already exists");
  const [row] = await db.insert(roles).values({ ...b, companyId: req.tenant!.companyId }).returning();
  audit(req, "create", "role", row.id, { name: row.name });
  created(res, row, "Role created");
}));
r.put("/:id", requirePermission("role.update"), validate(schema.partial()), asyncHandler(async (req, res) => {
  const [existing] = await db.select().from(roles).where(and(eq(roles.id, req.params.id), eq(roles.companyId, req.tenant!.companyId))).limit(1);
  if (!existing) throw notFound("Role not found");
  if (existing.isSystem && existing.name === "Company Admin") throw badRequest("Company Admin role cannot be modified");
  const [row] = await db.update(roles).set({ ...(req.body as object), updatedAt: new Date() }).where(eq(roles.id, existing.id)).returning();
  audit(req, "update", "role", row.id, req.body as Record<string, unknown>);
  ok(res, row, "Role updated");
}));
r.delete("/:id", requirePermission("role.delete"), asyncHandler(async (req, res) => {
  const [existing] = await db.select().from(roles).where(and(eq(roles.id, req.params.id), eq(roles.companyId, req.tenant!.companyId))).limit(1);
  if (!existing) throw notFound("Role not found");
  if (existing.isSystem) throw badRequest("System roles cannot be deleted");
  const [inUse] = await db.select({ id: users.id }).from(users).where(eq(users.roleId, existing.id)).limit(1);
  if (inUse) throw conflict("Role is assigned to users. Reassign them first.");
  await db.delete(roles).where(eq(roles.id, existing.id));
  audit(req, "delete", "role", existing.id, { name: existing.name });
  ok(res, null, "Role deleted");
}));
export default r;
