import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users, roles, refreshTokens } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, conflict, badRequest } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant, assertBranchInTenant } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";

const r = Router();
r.use(requireAuth, requireTenant);
const schema = z.object({
  name: z.string().min(2).max(150), email: z.string().email(), password: z.string().min(8),
  roleId: z.string().uuid(), branchId: z.string().uuid().optional(),
});

r.get("/", requirePermission("user.view"), asyncHandler(async (req, res) => {
  ok(res, await db.select({
    id: users.id, name: users.name, email: users.email, isActive: users.isActive, branchId: users.branchId,
    roleId: users.roleId, roleName: roles.name, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
  }).from(users).leftJoin(roles, eq(roles.id, users.roleId)).where(eq(users.companyId, req.tenant!.companyId)).orderBy(users.name));
}));

r.post("/", requirePermission("user.create"), validate(schema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof schema>;
  const [role] = await db.select().from(roles).where(and(eq(roles.id, b.roleId), eq(roles.companyId, req.tenant!.companyId))).limit(1);
  if (!role) throw badRequest("Invalid role");
  if (b.branchId) await assertBranchInTenant(req, b.branchId);
  const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, b.email.toLowerCase())).limit(1);
  if (dupe) throw conflict("Email already registered", "EMAIL_TAKEN");
  const [row] = await db.insert(users).values({
    companyId: req.tenant!.companyId, branchId: b.branchId, roleId: b.roleId, type: "company_user",
    name: b.name, email: b.email.toLowerCase(), passwordHash: await bcrypt.hash(b.password, 12),
  }).returning({ id: users.id, name: users.name, email: users.email });
  audit(req, "create", "user", row.id, { email: row.email, role: role.name });
  created(res, row, "User created");
}));

r.put("/:id", requirePermission("user.update"), validate(schema.partial().omit({ email: true }).extend({ isActive: z.boolean().optional() })), asyncHandler(async (req, res) => {
  const b = req.body as Partial<z.infer<typeof schema>> & { isActive?: boolean };
  const [existing] = await db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.companyId, req.tenant!.companyId))).limit(1);
  if (!existing) throw notFound("User not found");
  if (b.roleId) {
    const [role] = await db.select().from(roles).where(and(eq(roles.id, b.roleId), eq(roles.companyId, req.tenant!.companyId))).limit(1);
    if (!role) throw badRequest("Invalid role");
  }
  if (b.branchId) await assertBranchInTenant(req, b.branchId);
  const patch: Record<string, unknown> = { name: b.name, roleId: b.roleId, branchId: b.branchId, isActive: b.isActive, updatedAt: new Date() };
  if (b.password) patch.passwordHash = await bcrypt.hash(b.password, 12);
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
  const [row] = await db.update(users).set(patch).where(eq(users.id, existing.id)).returning({ id: users.id, name: users.name, isActive: users.isActive });
  if (b.isActive === false || b.password) await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, existing.id));
  audit(req, "update", "user", row.id, { ...b, password: b.password ? "[changed]" : undefined });
  ok(res, row, "User updated");
}));
export default r;
