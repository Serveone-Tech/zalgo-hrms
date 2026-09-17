// Seed: Super Admin + default plans. Run: pnpm db:seed
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { users, subscriptionPlans, subscriptionAddons } from "./schema.js";
import { env } from "../config/env.js";

async function main() {
  const [sa] = await db.select().from(users).where(eq(users.email, env.SUPER_ADMIN_EMAIL)).limit(1);
  if (!sa) {
    await db.insert(users).values({ type: "super_admin", name: "Zalgo Super Admin", email: env.SUPER_ADMIN_EMAIL, passwordHash: await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 12) });
    console.log(`✅ Super Admin created: ${env.SUPER_ADMIN_EMAIL}`);
  } else console.log("ℹ️  Super Admin already exists");

  const plans = [
    { name: "Starter", slug: "starter", monthlyPrice: "1999", yearlyPrice: "19990", includedEmployees: 25, includedBranches: 1, includedDevices: 1, additionalBranchPrice: "999", additionalEmployeePrice: "40", additionalDevicePrice: "499", modules: ["employees", "attendance", "leaves"], sortOrder: 1, description: "Small teams — employees, attendance aur leave." },
    { name: "Professional", slug: "professional", monthlyPrice: "4999", yearlyPrice: "49990", includedEmployees: 100, includedBranches: 2, includedDevices: 3, additionalBranchPrice: "1499", additionalEmployeePrice: "50", additionalDevicePrice: "499", modules: ["employees", "attendance", "leaves", "payroll", "devices", "reports"], sortOrder: 2, description: "Growing companies — payroll, biometric devices aur reports ke saath.", badge: "Most popular" },
    { name: "Business", slug: "business", monthlyPrice: "9999", yearlyPrice: "99990", includedEmployees: 300, includedBranches: 5, includedDevices: 10, additionalBranchPrice: "1299", additionalEmployeePrice: "35", additionalDevicePrice: "399", modules: ["employees", "attendance", "leaves", "payroll", "devices", "reports", "expenses", "recruitment", "helpdesk"], sortOrder: 3, description: "Multi-branch operations with recruitment & expenses." },
    { name: "Enterprise", slug: "enterprise", monthlyPrice: "24999", yearlyPrice: "249990", includedEmployees: 1000, includedBranches: 15, includedDevices: 40, additionalBranchPrice: "999", additionalEmployeePrice: "25", additionalDevicePrice: "299", modules: ["employees", "attendance", "leaves", "payroll", "devices", "reports", "expenses", "recruitment", "performance", "helpdesk", "analytics"], sortOrder: 4, description: "Everything, including performance & advanced analytics." },
  ];
  for (const p of plans) {
    const [exists] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, p.slug)).limit(1);
    if (!exists) { await db.insert(subscriptionPlans).values(p); console.log(`✅ Plan created: ${p.name}`); }
  }
  const addons = [
    { name: "Employee Pack (25)", slug: "employee-pack-25", type: "employee_pack", quantity: 25, monthlyPrice: "999", yearlyPrice: "9990", description: "25 extra employees" },
    { name: "Extra Biometric Device", slug: "extra-device", type: "device", quantity: 1, monthlyPrice: "499", yearlyPrice: "4990", description: "1 additional device slot" },
    { name: "Payroll Module", slug: "payroll-module", type: "module", moduleKey: "payroll", quantity: 1, monthlyPrice: "1499", yearlyPrice: "14990", description: "Unlock payroll on any plan" },
    { name: "Advanced Analytics", slug: "analytics-module", type: "module", moduleKey: "analytics", quantity: 1, monthlyPrice: "1999", yearlyPrice: "19990", description: "HR analytics dashboards" },
  ];
  for (const a of addons) {
    const [exists] = await db.select().from(subscriptionAddons).where(eq(subscriptionAddons.slug, a.slug)).limit(1);
    if (!exists) { await db.insert(subscriptionAddons).values(a); console.log(`✅ Add-on created: ${a.name}`); }
  }
  console.log("🌱 Seed complete");
}
main().catch((e) => { console.error(e); process.exit(1); });
