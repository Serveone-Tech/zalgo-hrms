import type { DeviceStatus, RawPunch } from "@hrms/shared-types";

export type DeviceConfig = { id: string; name: string; serial: string; brand: string; ip: string | null; port: number | null; branchId: string; pollIntervalSec: number; pushUsersRequested: boolean };
export type DeviceUser = { deviceUserId: string; name: string; employeeId: string };

// Section 52: har brand ka adapter yahi interface implement karta hai.
export interface DeviceAdapter {
  readonly brand: string;
  readonly mode: "poll" | "push"; // poll = agent device se logs fetch karta hai; push = device khud agent ko bhejta hai (ADMS)
  connect(cfg: DeviceConfig): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<DeviceStatus>;
  getDeviceInfo(): Promise<Record<string, unknown>>;
  getLogs(since?: Date): Promise<RawPunch[]>;
  syncUsers(): Promise<DeviceUser[]>;
  pushUsers(users: DeviceUser[]): Promise<{ pushed: number; failed: string[] }>;
}
export const adapterRegistry = new Map<string, () => DeviceAdapter>();
export const registerAdapter = (brand: string, factory: () => DeviceAdapter) => adapterRegistry.set(brand.toLowerCase(), factory);
export const createAdapter = (brand: string) => {
  const f = adapterRegistry.get(brand.toLowerCase());
  if (!f) throw new Error(`No adapter registered for brand: ${brand}`);
  return f();
};
