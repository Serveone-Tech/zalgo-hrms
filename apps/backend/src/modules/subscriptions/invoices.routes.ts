import { Router } from "express";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptionInvoices } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { notFound } from "../../common/errors.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { listInvoices, markInvoice } from "./invoice.service.js";

const r = Router();
r.use(requireAuth);
// company: apne invoices
r.get("/me", requireTenant, requirePermission("subscription.view"), asyncHandler(async (req, res) => { ok(res, await listInvoices(req.tenant!.companyId)); }));
// platform
const sa = Router(); sa.use(requireSuperAdmin);
sa.get("/", asyncHandler(async (req, res) => {
  const cid = req.query.companyId as string | undefined;
  ok(res, cid ? await listInvoices(cid) : await db.select().from(subscriptionInvoices).orderBy(desc(subscriptionInvoices.createdAt)).limit(200));
}));
sa.post("/:id/status", validate(z.object({ status: z.enum(["paid", "cancelled", "pending"]) })), asyncHandler(async (req, res) => {
  const inv = await markInvoice(req.params.id, (req.body as { status: "paid" }).status);
  if (!inv) throw notFound("Invoice not found");
  audit(req, "invoice_status", "invoice", inv.id, { status: inv.status }); ok(res, inv, `Invoice marked ${inv.status}`);
}));
r.use("/platform", sa);
export default r;
