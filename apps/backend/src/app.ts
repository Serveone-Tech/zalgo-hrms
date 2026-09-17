import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { apiV1 } from "./routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

export const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(","), credentials: true }));
// Razorpay webhook needs the raw body for HMAC verification — must be parsed before express.json().
app.use("/api/v1/payments/razorpay/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get("/health", (_req, res) => res.json({ success: true, message: "HRMS API healthy", data: { time: new Date().toISOString() } }));
app.use("/api/v1", apiV1);
app.use(notFoundHandler);
app.use(errorHandler);
