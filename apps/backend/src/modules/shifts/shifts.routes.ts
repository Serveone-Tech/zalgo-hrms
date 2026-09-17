import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { shifts, employeeShifts, holidays, employees } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, badRequest } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant, assertBranchInTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("attendance"));
const t = z.string().regex(/^\d{2}:\d{2}$/, "HH:mm");
const shiftSchema = z.object({
  name: z.string().min(2).max(80), type: z.enum(["general", "morning", "evening", "night", "flexible"]).default("general"), branchId: z.string().uuid().nullable().optional(),
  startTime: t, endTime: t, graceMinutes: z.coerce.number().int().min(0).default(10), minWorkMinutes: z.coerce.number().int().min(60).default(480), halfDayMinutes: z.coerce.number().int().min(30).default(240),
  lateAfterMinutes: z.coerce.number().int().min(0).default(10), earlyOutBeforeMinutes: z.coerce.number().int().min(0).default(10), overtimeAfterMinutes: z.coerce.number().int().min(60).default(540),
  weekOffDays: z.array(z.number().int().min(0).max(6)).default([0]), isDefault: z.boolean().default(false), isActive: z.boolean().default(true),
});

r.get("/", requirePermission("attendance.view"), asyncHandler(async (req, res) => { ok(res, await db.select().from(shifts).where(eq(shifts.companyId, req.tenant!.companyId)).orderBy(shifts.name)); }));
r.post("/", requirePermission("attendance.create"), validate(shiftSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof shiftSchema>;
  if (b.branchId) await assertBranchInTenant(req, b.branchId);
  if (b.halfDayMinutes >= b.minWorkMinutes) throw badRequest("Half-day minutes must be less than full-day minutes");
  if (b.isDefault) await db.update(shifts).set({ isDefault: false }).where(and(eq(shifts.companyId, req.tenant!.companyId), b.branchId ? eq(shifts.branchId, b.branchId) : eq(shifts.isDefault, true)));
  const [row] = await db.insert(shifts).values({ ...b, companyId: req.tenant!.companyId }).returning();
  audit(req, "create", "shift", row.id, { name: row.name }); created(res, row, "Shift created");
}));
r.put("/:id", requirePermission("attendance.create"), validate(shiftSchema.partial()), asyncHandler(async (req, res) => {
  const b = req.body as Partial<z.infer<typeof shiftSchema>>;
  if (b.isDefault) await db.update(shifts).set({ isDefault: false }).where(and(eq(shifts.companyId, req.tenant!.companyId), eq(shifts.isDefault, true)));
  const [row] = await db.update(shifts).set({ ...b, updatedAt: new Date() }).where(and(eq(shifts.id, req.params.id), eq(shifts.companyId, req.tenant!.companyId))).returning();
  if (!row) throw notFound("Shift not found");
  audit(req, "update", "shift", row.id, b); ok(res, row, "Shift updated");
}));
r.delete("/:id", requirePermission("attendance.create"), asyncHandler(async (req, res) => {
  const [row] = await db.delete(shifts).where(and(eq(shifts.id, req.params.id), eq(shifts.companyId, req.tenant!.companyId))).returning();
  if (!row) throw notFound("Shift not found");
  audit(req, "delete", "shift", row.id); ok(res, null, "Shift deleted");
}));
// Assign shift to employees
r.post("/:id/assign", requirePermission("attendance.create"), validate(z.object({ employeeIds: z.array(z.string().uuid()).min(1), effectiveFrom: z.coerce.date() })), asyncHandler(async (req, res) => {
  const [s] = await db.select().from(shifts).where(and(eq(shifts.id, req.params.id), eq(shifts.companyId, req.tenant!.companyId))).limit(1);
  if (!s) throw notFound("Shift not found");
  const b = req.body as { employeeIds: string[]; effectiveFrom: Date };
  const emps = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, req.tenant!.companyId)));
  const valid = new Set(emps.map((e) => e.id));
  const ids = b.employeeIds.filter((i) => valid.has(i));
  const dayBefore = new Date(b.effectiveFrom.getTime() - 86400000);
  for (const employeeId of ids) {
    await db.update(employeeShifts).set({ effectiveTo: dayBefore }).where(and(eq(employeeShifts.employeeId, employeeId), eq(employeeShifts.companyId, req.tenant!.companyId)));
    await db.insert(employeeShifts).values({ companyId: req.tenant!.companyId, employeeId, shiftId: s.id, effectiveFrom: b.effectiveFrom });
  }
  audit(req, "assign", "shift", s.id, { employees: ids.length }); ok(res, { assigned: ids.length }, `Shift assigned to ${ids.length} employee(s)`);
}));
r.get("/assignments/:employeeId", requirePermission("attendance.view"), asyncHandler(async (req, res) => {
  ok(res, await db.select({ id: employeeShifts.id, shiftName: shifts.name, effectiveFrom: employeeShifts.effectiveFrom, effectiveTo: employeeShifts.effectiveTo }).from(employeeShifts).innerJoin(shifts, eq(shifts.id, employeeShifts.shiftId)).where(and(eq(employeeShifts.employeeId, req.params.employeeId), eq(employeeShifts.companyId, req.tenant!.companyId))).orderBy(desc(employeeShifts.effectiveFrom)));
}));

// ---- Holidays (Section 68) ----
const hol = Router();
const holSchema = z.object({ name: z.string().min(2), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), branchId: z.string().uuid().nullable().optional(), isOptional: z.boolean().default(false) });
hol.get("/", requirePermission("attendance.view"), asyncHandler(async (req, res) => {
  const year = String(req.query.year ?? new Date().getFullYear());
  ok(res, await db.select().from(holidays).where(and(eq(holidays.companyId, req.tenant!.companyId), eq(sql`substr(${holidays.date},1,4)`, year))).orderBy(holidays.date));
}));
hol.post("/", requirePermission("attendance.create"), validate(holSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof holSchema>;
  if (b.branchId) await assertBranchInTenant(req, b.branchId);
  const [row] = await db.insert(holidays).values({ ...b, companyId: req.tenant!.companyId }).returning();
  audit(req, "create", "holiday", row.id, { name: row.name, date: row.date }); created(res, row, "Holiday added");
}));
hol.delete("/:id", requirePermission("attendance.create"), asyncHandler(async (req, res) => {
  const [row] = await db.delete(holidays).where(and(eq(holidays.id, req.params.id), eq(holidays.companyId, req.tenant!.companyId))).returning();
  if (!row) throw notFound("Holiday not found");
  audit(req, "delete", "holiday", row.id); ok(res, null, "Holiday removed");
}));
import { sql } from "drizzle-orm";
r.use("/holidays", hol);
export default r;
