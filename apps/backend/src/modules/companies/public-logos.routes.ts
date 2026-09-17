import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { asyncHandler } from "../../common/handler.js";
import { notFound } from "../../common/errors.js";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const SAFE = /^[A-Za-z0-9._-]+$/; // no path separators — blocks traversal

// Public, unauthenticated — logos are not sensitive. Scoped to exactly uploads/<companyId>/logo/<file>,
// never the whole uploads root (which also holds employee documents behind signed URLs).
const r = Router();
r.get("/:companyId/logo/:filename", asyncHandler(async (req, res) => {
  const { companyId, filename } = req.params;
  if (!SAFE.test(companyId) || !SAFE.test(filename)) throw notFound("Not found");
  const filePath = path.join(UPLOAD_ROOT, companyId, "logo", filename);
  if (!fs.existsSync(filePath)) throw notFound("Not found");
  res.sendFile(filePath);
}));
export default r;
