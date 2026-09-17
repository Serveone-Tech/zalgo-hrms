import type { DeviceStatus, RawPunch } from "@hrms/shared-types";
import { registerAdapter, type DeviceAdapter, type DeviceConfig, type DeviceUser } from "./base.js";

// Testing ke liye: har poll par mapped users mein se random punches banata hai. Production mein use mat karo.
class SimulatorAdapter implements DeviceAdapter {
  readonly brand = "simulator"; readonly mode = "poll" as const;
  private cfg?: DeviceConfig; private users: DeviceUser[] = [];
  async connect(cfg: DeviceConfig) { this.cfg = cfg; }
  async disconnect() {}
  async getStatus(): Promise<DeviceStatus> { return "online"; }
  async getDeviceInfo() { return { simulator: true, users: this.users.length }; }
  async getLogs(): Promise<RawPunch[]> {
    if (!this.users.length || Math.random() > 0.5) return [];
    const u = this.users[Math.floor(Math.random() * this.users.length)];
    return [{ deviceSerial: this.cfg!.serial, deviceUserId: u.deviceUserId, punchedAt: new Date().toISOString(), type: "unknown" }];
  }
  async syncUsers() { return this.users; }
  async pushUsers(users: DeviceUser[]) { this.users = users; return { pushed: users.length, failed: [] }; }
}
registerAdapter("simulator", () => new SimulatorAdapter());
