import type { DeviceStatus, RawPunch } from "@hrms/shared-types";
import { registerAdapter, type DeviceAdapter, type DeviceConfig, type DeviceUser } from "./base.js";

/**
 * ADMS / "Push SDK" adapter — ZKTeco, eSSL aur bahut se biometric devices HTTP par apne logs push karte hain.
 * Device menu → Comm → Cloud Server: server = <agent IP>, port = AGENT_PORT. Bas.
 * Yeh adapter passive hai: punches `adms.server.ts` receive karta hai aur yahan buffer hote hain.
 */
export class AdmsAdapter implements DeviceAdapter {
  readonly brand = "adms"; readonly mode = "push" as const;
  static bySerial = new Map<string, AdmsAdapter>();
  cfg?: DeviceConfig; buffer: RawPunch[] = []; lastContact = 0; pendingUsers: DeviceUser[] = [];
  async connect(cfg: DeviceConfig) { this.cfg = cfg; AdmsAdapter.bySerial.set(cfg.serial, this); }
  async disconnect() { if (this.cfg) AdmsAdapter.bySerial.delete(this.cfg.serial); }
  async getStatus(): Promise<DeviceStatus> { return Date.now() - this.lastContact < 5 * 60000 ? "online" : "offline"; }
  async getDeviceInfo() { return { mode: "push", lastContact: this.lastContact ? new Date(this.lastContact).toISOString() : null }; }
  async getLogs() { const b = this.buffer; this.buffer = []; return b; }
  async syncUsers() { return []; }
  async pushUsers(users: DeviceUser[]) { this.pendingUsers = users; return { pushed: users.length, failed: [] }; } // sent as C:CMD on next device poll
  receive(p: RawPunch[]) { this.buffer.push(...p); this.lastContact = Date.now(); }
}
registerAdapter("adms", () => new AdmsAdapter());
