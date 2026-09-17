import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { and, eq, count, desc, inArray, sql, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import { devices, deviceEmployees, deviceLogs, employees, branches, companies } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, conflict, limitReached, badRequest } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant, assertBranchInTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { fullName } from "../employees/employees.service.js";
import { emitToCompany } from "../../sockets.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("devices"));
const schema = z.object({
  name: z.string().min(2).max(120), branchId: z.string().uuid(), type: z.enum(["fingerprint", "face", "rfid", "access_control"]).default("fingerprint"),
  brand: z.enum(["zkteco", "essl", "matrix", "adms", "simulator"]).default("zkteco"), model: z.string().max(80).optional().nullable(),
  serialNumber: z.string().min(2).max(80), ipAddress: z.string().max(60).optional().nullable(), port: z.coerce.number().int().min(1).max(65535).default(4370),
  location: z.string().max(120).optional().nullable(), pollIntervalSec: z.coerce.number().int().min(10).max(3600).default(60),
});
const scoped = (req: any, id: string) => db.select().from(devices).where(and(eq(devices.id, id), eq(devices.companyId, req.tenant!.companyId))).limit(1);

r.get("/", requirePermission("device.view"), asyncHandler(async (req, res) => {
  const rows = await db.select({ ...devices as any, branchName: branches.name, mappedUsers: sql<number>`(select count(*) from ${deviceEmployees} where ${deviceEmployees.deviceId} = ${devices.id})`.mapWith(Number) }).from(devices).leftJoin(branches, eq(branches.id, devices.branchId)).where(eq(devices.companyId, req.tenant!.companyId)).orderBy(devices.name);
  ok(res, req.tenant!.branchIds === "all" ? rows : rows.filter((d: any) => (req.tenant!.branchIds as string[]).includes(d.branchId)));
}));
// Agent setup: company agent key (Section 51)
r.get("/agent-key", requirePermission("device.manage"), asyncHandler(async (req, res) => {
  const [c] = await db.select({ agentKey: companies.agentKey }).from(companies).where(eq(companies.id, req.tenant!.companyId)).limit(1);
  ok(res, { agentKey: c.agentKey });
}));
r.post("/agent-key/rotate", requirePermission("device.manage"), asyncHandler(async (req, res) => {
  const agentKey = `agt_${crypto.randomBytes(24).toString("base64url")}`;
  await db.update(companies).set({ agentKey }).where(eq(companies.id, req.tenant!.companyId));
  audit(req, "rotate", "agent_key", req.tenant!.companyId); ok(res, { agentKey }, "Agent key generated. Update the agent's .env");
}));

r.post("/", requirePermission("device.manage"), validate(schema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof schema>;
  await assertBranchInTenant(req, b.branchId);
  const [{ n }] = await db.select({ n: count() }).from(devices).where(and(eq(devices.companyId, req.tenant!.companyId), ne(devices.status, "disabled")));
  if (n >= req.tenant!.limits.devices) throw limitReached(`Device limit reached (${req.tenant!.limits.devices}). Upgrade plan or buy a device add-on.`);
  const [dupe] = await db.select({ id: devices.id }).from(devices).where(and(eq(devices.companyId, req.tenant!.companyId), eq(devices.serialNumber, b.serialNumber))).limit(1);
  if (dupe) throw conflict("A device with this serial number already exists");
  const [row] = await db.insert(devices).values({ ...b, companyId: req.tenant!.companyId }).returning();
  audit(req, "create", "device", row.id, { name: row.name, serial: row.serialNumber }); created(res, row, "Device added. Start the hardware agent to connect it.");
}));
r.put("/:id", requirePermission("device.manage"), validate(schema.partial()), asyncHandler(async (req, res) => {
  const [d] = await scoped(req, req.params.id); if (!d) throw notFound("Device not found");
  const b = req.body as Partial<z.infer<typeof schema>>;
  if (b.branchId) await assertBranchInTenant(req, b.branchId);
  const [row] = await db.update(devices).set({ ...b, updatedAt: new Date() }).where(eq(devices.id, d.id)).returning();
  audit(req, "update", "device", row.id, b); ok(res, row, "Device updated");
}));
r.post("/:id/status", requirePermission("device.manage"), validate(z.object({ disabled: z.boolean() })), asyncHandler(async (req, res) => {
  const [d] = await scoped(req, req.params.id); if (!d) throw notFound("Device not found");
  const [row] = await db.update(devices).set({ status: (req.body as any).disabled ? "disabled" : "offline", updatedAt: new Date() }).where(eq(devices.id, d.id)).returning();
  audit(req, "device_status", "device", row.id, { status: row.status }); ok(res, row, `Device ${row.status}`);
}));
r.delete("/:id", requirePermission("device.manage"), asyncHandler(async (req, res) => {
  const [d] = await scoped(req, req.params.id); if (!d) throw notFound("Device not found");
  await db.delete(devices).where(eq(devices.id, d.id));
  audit(req, "delete", "device", d.id, { serial: d.serialNumber }); ok(res, null, "Device removed");
}));
r.get("/:id", requirePermission("device.view"), asyncHandler(async (req, res) => {
  const [d] = await scoped(req, req.params.id); if (!d) throw notFound("Device not found");
  const mapped = await db.select({ id: deviceEmployees.id, employeeId: deviceEmployees.employeeId, deviceUserId: deviceEmployees.deviceUserId, syncedToDevice: deviceEmployees.syncedToDevice, name: fullName, employeeCode: employees.employeeCode }).from(deviceEmployees).innerJoin(employees, eq(employees.id, deviceEmployees.employeeId)).where(eq(deviceEmployees.deviceId, d.id)).orderBy(employees.employeeCode);
  const logs = await db.select().from(deviceLogs).where(eq(deviceLogs.deviceId, d.id)).orderBy(desc(deviceLogs.createdAt)).limit(50);
  ok(res, { ...d, mapped, logs });
}));
// Map employees to device (uses employees.deviceUserId by default, or employee code)
r.post("/:id/employees", requirePermission("device.manage"), validate(z.object({ employeeIds: z.array(z.string().uuid()).min(1) })), asyncHandler(async (req, res) => {
  const [d] = await scoped(req, req.params.id); if (!d) throw notFound("Device not found");
  const emps = await db.select().from(employees).where(and(eq(employees.companyId, d.companyId), inArray(employees.id, (req.body as any).employeeIds)));
  let n = 0;
  for (const e of emps) {
    const uid = e.deviceUserId || e.employeeCode.replace(/\D/g, "").replace(/^0+/, "") || String(Math.floor(Math.random() * 1e6));
    await db.insert(deviceEmployees).values({ companyId: d.companyId, deviceId: d.id, employeeId: e.id, deviceUserId: uid }).onConflictDoNothing(); n++;
    if (!e.deviceUserId) await db.update(employees).set({ deviceUserId: uid }).where(eq(employees.id, e.id));
  }
  await db.update(devices).set({ pushUsersRequested: true }).where(eq(devices.id, d.id));
  audit(req, "map_employees", "device", d.id, { count: n }); ok(res, { mapped: n }, `${n} employee(s) mapped; agent will push them to the device`);
}));
r.delete("/:id/employees/:mapId", requirePermission("device.manage"), asyncHandler(async (req, res) => {
  const [d] = await scoped(req, req.params.id); if (!d) throw notFound("Device not found");
  await db.delete(deviceEmployees).where(and(eq(deviceEmployees.id, req.params.mapId), eq(deviceEmployees.deviceId, d.id)));
  ok(res, null, "Mapping removed");
}));
r.post("/:id/push-users", requirePermission("device.manage"), asyncHandler(async (req, res) => {
  const [d] = await scoped(req, req.params.id); if (!d) throw notFound("Device not found");
  await db.update(devices).set({ pushUsersRequested: true }).where(eq(devices.id, d.id));
  emitToCompany(d.companyId, "device:push_requested", { deviceId: d.id });
  ok(res, null, "Users will be pushed on the agent's next cycle");
}));
void badRequest;
export default r;
