import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";
import type { Request } from "express";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

// Shared by Super Admin (Companies.tsx) and self-service onboarding — one place owns the disk layout.
export const makeLogoUpload = (companyIdOf: (req: Request) => string) =>
  multer({
    storage: multer.diskStorage({
      destination: (req, _f, cb) => { const d = path.join(UPLOAD_ROOT, companyIdOf(req), "logo"); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
      filename: (_req, f, cb) => cb(null, `logo-${crypto.randomUUID()}${path.extname(f.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_r, f, cb) => cb(null, /^image\/(png|jpe?g|webp|svg\+xml)$/.test(f.mimetype)),
  });

export const logoUrlFor = (companyId: string, filename: string) => `/api/v1/public/logos/${companyId}/logo/${filename}`;
