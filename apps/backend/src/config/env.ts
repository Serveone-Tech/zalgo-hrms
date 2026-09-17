import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(5000),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  SUPER_ADMIN_EMAIL: z.string().email().default("admin@zalgoinfotech.com"),
  SUPER_ADMIN_PASSWORD: z.string().min(8).default("Admin@12345"),
  HARDWARE_AGENT_KEY: z.string().default("dev-agent-key"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  APP_URL: z.string().default("http://localhost:3000"),
  SIGNUP_ENABLED: z.coerce.boolean().default(true),
  SIGNUP_TRIAL_ENABLED: z.coerce.boolean().default(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
