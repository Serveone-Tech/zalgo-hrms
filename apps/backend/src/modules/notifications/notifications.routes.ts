import { Router } from "express";
import { z } from "zod";
import { and, eq, desc, isNull, count } from "drizzle-orm";
import { db } from "../../db/index.js";
import { notifications, notificationSettings } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { settingsFor, EVENTS, notify } from "./notify.service.js";
import { sendEmail } from "./channels.js";

const r = Router();
r.use(requireAuth);
r.get("/", asyncHandler(async (req, res) => {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, req.user!.id)).orderBy(desc(notifications.createdAt)).limit(50);
  const [{ unread }] = await db.select({ unread: count() }).from(notifications).where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt)));
  ok(res, { rows, unread });
}));
r.post("/read", validate(z.object({ ids: z.array(z.string().uuid()).optional() })), asyncHandler(async (req, res) => {
  const ids = (req.body as any).ids as string[] | undefined;
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt), ids?.length ? (await import("drizzle-orm")).inArray(notifications.id, ids) : undefined));
  ok(res, null);
}));
// Company settings (Section 94)
const t = Router(); t.use(requireTenant, requirePermission("company.settings"));
t.get("/settings", asyncHandler(async (req, res) => { const s = await settingsFor(req.tenant!.companyId); ok(res, { ...s, email: { ...s.email, pass: s.email.pass ? "••••••" : "" }, sms: { ...s.sms, authKey: s.sms.authKey ? "••••••" : "" }, whatsapp: { ...s.whatsapp, apiKey: s.whatsapp.apiKey ? "••••••" : "" }, catalogue: EVENTS }); }));
t.put("/settings", validate(z.object({ email: z.any(), sms: z.any(), whatsapp: z.any(), events: z.record(z.object({ inApp: z.boolean(), email: z.boolean(), sms: z.boolean(), whatsapp: z.boolean() })) })), asyncHandler(async (req, res) => {
  const cur = await settingsFor(req.tenant!.companyId); const b = req.body as any;
  const keep = (n: any, o: any, k: string) => ({ ...n, [k]: n[k] === "••••••" ? o[k] : n[k] });
  const [row] = await db.update(notificationSettings).set({ email: keep(b.email, cur.email, "pass"), sms: keep(b.sms, cur.sms, "authKey"), whatsapp: keep(b.whatsapp, cur.whatsapp, "apiKey"), events: b.events, updatedAt: new Date() }).where(eq(notificationSettings.id, cur.id)).returning();
  audit(req, "update", "notification_settings", cur.id); ok(res, row, "Notification settings saved");
}));
t.post("/test", validate(z.object({ channel: z.enum(["email", "inApp"]) })), asyncHandler(async (req, res) => {
  const ch = (req.body as any).channel; const s = await settingsFor(req.tenant!.companyId);
  if (ch === "email") { await sendEmail(s.email, req.user!.email, "Zalgo HRMS test email", "SMTP settings are working."); return ok(res, null, `Test email sent to ${req.user!.email}`); }
  await notify({ companyId: req.tenant!.companyId, userIds: [req.user!.id], type: "automation", title: "Test notification", body: "In-app notifications are working.", priority: "success" }); ok(res, null, "Test notification sent");
}));
r.use("/company", t);
export default r;
