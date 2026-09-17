import "dotenv/config";
import express from "express";
import axios from "axios";
import "./adapters/zkteco.js"; import "./adapters/adms.js"; import "./adapters/simulator.js";
import { adapterRegistry, createAdapter, type DeviceAdapter, type DeviceConfig } from "./adapters/base.js";
import { queue } from "./queue.js";
import { mountAdms } from "./adms.server.js";

const PORT = Number(process.env.AGENT_PORT ?? 5001);
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:5000").replace(/\/$/, "");
const AGENT_KEY = process.env.HARDWARE_AGENT_KEY ?? "";
if (!AGENT_KEY) { console.error("❌ HARDWARE_AGENT_KEY missing — HRMS → Devices → Agent setup se key copy karo"); process.exit(1); }
const api = axios.create({ baseURL: `${BACKEND_URL}/api/v1/devices/agent`, headers: { "x-agent-key": AGENT_KEY }, timeout: 15000 });

type Live = { cfg: DeviceConfig; adapter: DeviceAdapter; timer?: NodeJS.Timeout; status: "online" | "offline" | "syncing" | "error"; error: string | null; userCount: number };
const live = new Map<string, Live>();
let backendUp = false;

const log = (id: string, level: "info" | "warn" | "error", event: string, message: string) => api.post(`/devices/${id}/log`, { level, event, message }).catch(() => {});

async function loadConfig() {
  const { data } = await api.get("/config"); backendUp = true;
  const cfgs = data.data as DeviceConfig[]; const seen = new Set<string>();
  for (const cfg of cfgs) {
    seen.add(cfg.id);
    let l = live.get(cfg.id);
    if (!l || l.cfg.brand !== cfg.brand || l.cfg.ip !== cfg.ip || l.cfg.port !== cfg.port) {
      if (l) { clearInterval(l.timer); await l.adapter.disconnect().catch(() => {}); }
      let adapter: DeviceAdapter;
      try { adapter = createAdapter(cfg.brand); } catch (e: any) { live.set(cfg.id, { cfg, adapter: null as any, status: "error", error: e.message, userCount: 0 }); continue; }
      l = { cfg, adapter, status: "offline", error: null, userCount: 0 }; live.set(cfg.id, l);
      try { await adapter.connect(cfg); l.status = "online"; console.log(`🔌 Connected ${cfg.name} [${cfg.brand}${cfg.ip ? " " + cfg.ip : ""}]`); }
      catch (e: any) { l.status = "error"; l.error = e.message; console.warn(`⚠️  ${cfg.name}: ${e.message}`); }
      l.timer = setInterval(() => poll(cfg.id), Math.max(10, cfg.pollIntervalSec) * 1000);
    } else l.cfg = cfg;
    if (cfg.pushUsersRequested && l.adapter) pushUsers(cfg.id).catch(() => {});
  }
  for (const [id, l] of live) if (!seen.has(id)) { clearInterval(l.timer); await l.adapter?.disconnect().catch(() => {}); live.delete(id); console.log(`➖ Removed device ${l.cfg.name}`); }
}
async function poll(id: string) {
  const l = live.get(id); if (!l?.adapter) return;
  try {
    const st = await l.adapter.getStatus();
    if (st === "offline" && l.adapter.mode === "poll") { try { await l.adapter.connect(l.cfg); } catch (e: any) { l.status = "error"; l.error = e.message; return; } }
    l.status = "syncing";
    const punches = await l.adapter.getLogs();
    if (punches.length) { queue.enqueue(punches.map((p) => ({ ...p, deviceId: id }))); console.log(`📥 ${l.cfg.name}: ${punches.length} punches queued`); }
    const s2 = await l.adapter.getStatus(); l.status = s2 === "disabled" ? "offline" : s2; l.error = null;
  } catch (e: any) { l.status = "error"; l.error = e.message; log(id, "error", "poll", e.message); }
}
async function pushUsers(id: string) {
  const l = live.get(id); if (!l?.adapter) return;
  const { data } = await api.get(`/devices/${id}/users`);
  const users = (data.data as any[]).map((u) => ({ deviceUserId: u.deviceUserId, name: u.name, employeeId: u.employeeId }));
  const r = await l.adapter.pushUsers(users); l.userCount = r.pushed;
  await api.post(`/devices/${id}/users-pushed`, r);
  console.log(`👥 ${l.cfg.name}: ${r.pushed} users pushed`);
}
// Section 57: offline queue → backend, retry until ack
async function flush() {
  const batch = queue.peek(500); if (!batch.length) return;
  try { const { data } = await api.post("/ingest", { punches: batch }); queue.ack(batch); backendUp = true; console.log(`📤 Synced ${batch.length} → stored ${data.data.inserted}, dup ${data.data.skipped}, unmapped ${data.data.unmapped}`); }
  catch (e: any) { backendUp = false; console.warn(`⏳ Backend unreachable (${e.message}); ${queue.size()} punches queued locally`); }
}
async function heartbeat() {
  if (!live.size) return;
  try { await api.post("/heartbeat", { devices: [...live.values()].map((l) => ({ id: l.cfg.id, status: l.status, error: l.error, userCount: l.userCount })) }); backendUp = true; } catch { backendUp = false; }
}

const app = express();
app.get("/health", (_req, res) => res.json({ success: true, message: "Hardware agent running", data: { backendUp, adapters: [...adapterRegistry.keys()], queued: queue.size(), devices: [...live.values()].map((l) => ({ name: l.cfg.name, brand: l.cfg.brand, status: l.status, error: l.error })) } }));
mountAdms(app);
app.listen(PORT, async () => {
  console.log(`🔌 Hardware Agent → http://localhost:${PORT}  (ADMS push endpoint: http://<this-ip>:${PORT}/iclock/cdata)`);
  const boot = async () => { try { await loadConfig(); } catch (e: any) { console.warn(`⏳ Backend not reachable yet: ${e.message}`); } };
  await boot();
  setInterval(boot, 60 * 1000); setInterval(flush, 10 * 1000); setInterval(heartbeat, 30 * 1000);
});
