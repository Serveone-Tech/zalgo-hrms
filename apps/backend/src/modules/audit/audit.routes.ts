import { Router } from "express";
import { eq, desc, count, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLogs } from "../../db/schema.js";
import { asyncHandler, paginate } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permission.js";

const r = Router();
r.use(requireAuth);
// Super admin: platform logs (companyId null) ya ?companyId=; Company: sirf apne.
r.get("/", asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query as Record<string, unknown>);
  let where;
  if (req.user!.type === "super_admin") {
    const cid = req.query.companyId as string | undefined;
    where = cid ? eq(auditLogs.companyId, cid) : undefined;
  } else {
    if (req.user!.permissions !== "*" && !req.user!.permissions.includes("audit.view")) return requirePermission("audit.view")(req, res, () => {});
    where = eq(auditLogs.companyId, req.user!.companyId!);
  }
  const rows = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(auditLogs).where(where);
  ok(res, rows, "OK", { page, limit, total });
}));
export default r;
