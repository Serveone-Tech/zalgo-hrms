import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db } from "../../db/index.js";
import { users, refreshTokens } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok } from "../../common/response.js";
import { unauthorized, conflict, forbidden, AppError } from "../../common/errors.js";
import { buildAuthUser, requireAuth, signAccess } from "../../middleware/auth.js";
import { audit } from "../../common/audit.js";
import { createCompanyWorkspace } from "../companies/company.service.js";
import { notify } from "../notifications/notify.service.js";
import { emitToPlatform } from "../../sockets.js";

const r = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

async function issueRefresh(userId: string, ua?: string, ip?: string) {
  const raw = crypto.randomBytes(48).toString("base64url");
  await db.insert(refreshTokens).values({
    userId, tokenHash: hash(raw), userAgent: ua, ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000),
  });
  return raw;
}

r.post("/login", loginLimiter, validate(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!u) throw unauthorized("Invalid email or password");
    if (u.lockedUntil && u.lockedUntil.getTime() > Date.now())
      throw new AppError(423, "Account locked due to too many failed attempts. Try again in 15 minutes.", "ACCOUNT_LOCKED");

    const valid = await bcrypt.compare(password, u.passwordHash);
    if (!valid) {
      const attempts = u.failedLoginAttempts + 1;
      await db.update(users).set({
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60000) : null,
      }).where(eq(users.id, u.id));
      throw unauthorized("Invalid email or password");
    }
    const user = await buildAuthUser(u.id);
    if (!user) throw unauthorized("Account is inactive");
    if (user.company && user.company.status === "suspended")
      throw new AppError(403, "Your company account is suspended. Contact support.", "COMPANY_SUSPENDED");

    await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, u.id));
    const accessToken = signAccess({ sub: u.id, type: u.type, companyId: u.companyId });
    const refreshToken = await issueRefresh(u.id, req.headers["user-agent"], req.ip);
    req.user = user;
    audit(req, "login", "user", u.id);
    ok(res, { user, accessToken, refreshToken }, "Logged in");
  }));

const signupSchema = z.object({
  ownerName: z.string().min(2).max(150),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/, "Add an uppercase letter").regex(/[0-9]/, "Add a number"),
  mobile: z.string().max(30).optional(),
  companyName: z.string().min(2).max(200),
  agreeTerms: z.literal(true, { errorMap: () => ({ message: "You must agree to the Terms" }) }),
});
r.post("/signup", loginLimiter, validate(signupSchema), asyncHandler(async (req, res) => {
  if (!env.SIGNUP_ENABLED) throw forbidden("Self-service signup is currently disabled");
  const b = req.body as z.infer<typeof signupSchema>;
  const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, b.email.toLowerCase())).limit(1);
  if (dupe) throw conflict("Email already registered", "EMAIL_TAKEN");

  const { company, user } = await createCompanyWorkspace({
    company: { name: b.companyName, country: "India", timezone: "Asia/Kolkata" },
    owner: { name: b.ownerName, email: b.email, password: b.password, mobile: b.mobile },
    onboardingStatus: "profile", status: "inactive",
  });

  const authUser = await buildAuthUser(user.id);
  if (!authUser) throw unauthorized("Could not create session");
  const accessToken = signAccess({ sub: user.id, type: "company_user", companyId: company.id });
  const refreshToken = await issueRefresh(user.id, req.headers["user-agent"], req.ip);
  req.user = authUser;
  audit(req, "signup", "company", company.id, { companyName: company.name });
  emitToPlatform("company:signup", { companyId: company.id, name: company.name });
  const superAdmins = (await db.select({ id: users.id }).from(users).where(eq(users.type, "super_admin"))).map((u) => u.id);
  await notify({ companyId: null, userIds: superAdmins, type: "company.signup", title: "New self-service signup", body: `${company.name} just signed up.`, priority: "info" });
  ok(res, { user: authUser, accessToken, refreshToken, onboardingStatus: company.onboardingStatus }, "Account created");
}));

r.post("/refresh", validate(z.object({ refreshToken: z.string() })), asyncHandler(async (req, res) => {
  const raw = (req.body as { refreshToken: string }).refreshToken;
  const [t] = await db.select().from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, hash(raw)), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date()))).limit(1);
  if (!t) throw unauthorized("Session expired, please login again");
  const user = await buildAuthUser(t.userId);
  if (!user) throw unauthorized("Account is inactive");
  // rotate
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, t.id));
  const refreshToken = await issueRefresh(t.userId, req.headers["user-agent"], req.ip);
  const accessToken = signAccess({ sub: user.id, type: user.type, companyId: user.companyId });
  ok(res, { user, accessToken, refreshToken });
}));

r.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  const raw = (req.body as { refreshToken?: string })?.refreshToken;
  if (raw) await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, hash(raw)));
  audit(req, "logout", "user", req.user!.id);
  ok(res, null, "Logged out");
}));

r.get("/me", requireAuth, asyncHandler(async (req, res) => { ok(res, req.user); }));

r.post("/change-password", requireAuth,
  validate(z.object({ currentPassword: z.string(), newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/) })),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const [u] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!u || !(await bcrypt.compare(currentPassword, u.passwordHash))) throw unauthorized("Current password is incorrect");
    await db.update(users).set({ passwordHash: await bcrypt.hash(newPassword, 12), updatedAt: new Date() }).where(eq(users.id, u.id));
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, u.id));
    audit(req, "password_change", "user", u.id);
    ok(res, null, "Password changed. Please login again.");
  }));

export default r;
