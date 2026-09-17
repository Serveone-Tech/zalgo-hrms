import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "./config/env.js";
import type { AccessPayload } from "./middleware/auth.js";

let io: Server;
// Section 101: tenant-scoped rooms — company:<id> ; super admin => room "platform"
export function initSockets(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.CORS_ORIGIN.split(","), credentials: true } });
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("unauthorized"));
      const p = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
      socket.data.user = p;
      next();
    } catch { next(new Error("unauthorized")); }
  });
  io.on("connection", (socket) => {
    const p = socket.data.user as AccessPayload;
    socket.join(p.type === "super_admin" ? "platform" : `company:${p.companyId}`);
  });
  return io;
}
export const emitToCompany = (companyId: string, event: string, payload: unknown) => io?.to(`company:${companyId}`).emit(event, payload);
export const emitToPlatform = (event: string, payload: unknown) => io?.to("platform").emit(event, payload);
