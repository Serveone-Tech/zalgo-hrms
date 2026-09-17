import type { DeviceStatus, RawPunch } from "@hrms/shared-types";
import { registerAdapter, type DeviceAdapter, type DeviceConfig, type DeviceUser } from "./base.js";

/**
 * ZKTeco / eSSL TCP adapter (port 4370, ZK protocol).
 * Uses optional dependency `node-zklib`. Install in apps/hardware-agent: pnpm add node-zklib
 * Agar library install nahi hai to adapter "error" status deta hai with a clear message —
 * devices that support ADMS/push should use brand = "adms" instead (no library needed).
 */
class ZKTecoAdapter implements DeviceAdapter {
  readonly brand = "zkteco"; readonly mode = "poll" as const;
  private cfg?: DeviceConfig; private zk: any; private lastError: string | null = null; private lastSeen = new Set<string>();
  async connect(cfg: DeviceConfig) {
    this.cfg = cfg;
    let ZKLib: any;
    try { ZKLib = (await import("node-zklib" as any)).default; } catch { this.lastError = "node-zklib not installed (pnpm add node-zklib) — or use brand 'adms' for push devices"; throw new Error(this.lastError); }
    this.zk = new ZKLib(cfg.ip, cfg.port ?? 4370, 10000, 4000);
    await this.zk.createSocket(); this.lastError = null;
  }
  async disconnect() { try { await this.zk?.disconnect(); } catch {} }
  async getStatus(): Promise<DeviceStatus> { return this.lastError ? "error" : this.zk ? "online" : "offline"; }
  async getDeviceInfo() { try { return await this.zk.getInfo(); } catch (e: any) { this.lastError = e.message; return {}; } }
  async getLogs(): Promise<RawPunch[]> {
    const res = await this.zk.getAttendances();
    const out: RawPunch[] = [];
    for (const l of res?.data ?? []) {
      const at = new Date(l.recordTime); const key = `${l.deviceUserId}|${at.getTime()}`;
      if (this.lastSeen.has(key)) continue; this.lastSeen.add(key);
      out.push({ deviceSerial: this.cfg!.serial, deviceUserId: String(l.deviceUserId), punchedAt: at.toISOString(), type: "unknown" });
    }
    if (this.lastSeen.size > 50000) this.lastSeen.clear();
    return out;
  }
  async syncUsers(): Promise<DeviceUser[]> { const u = await this.zk.getUsers(); return (u?.data ?? []).map((x: any) => ({ deviceUserId: String(x.userId), name: x.name, employeeId: "" })); }
  async pushUsers(users: DeviceUser[]) {
    const failed: string[] = []; let pushed = 0;
    for (const u of users) { try { await this.zk.setUser(Number(u.deviceUserId), u.deviceUserId, u.name.slice(0, 24), "", 0, 0); pushed++; } catch { failed.push(u.deviceUserId); } }
    return { pushed, failed };
  }
  error() { return this.lastError; }
}
registerAdapter("zkteco", () => new ZKTecoAdapter());
registerAdapter("essl", () => new ZKTecoAdapter());
registerAdapter("matrix", () => new ZKTecoAdapter()); // Matrix COSEC ZK-compatible models; native SDK adapter can be added later
