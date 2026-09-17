import fs from "node:fs";
import path from "node:path";
import type { RawPunch } from "@hrms/shared-types";

// Section 57: offline local queue with duplicate prevention. File-based (SQLite Phase 5 mein).
const file = path.resolve(process.cwd(), "data", "queue.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
const load = (): RawPunch[] => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : []);
const save = (q: RawPunch[]) => fs.writeFileSync(file, JSON.stringify(q));
const key = (p: RawPunch) => `${p.deviceSerial}|${p.deviceUserId}|${p.punchedAt}`;

export const queue = {
  enqueue(punches: RawPunch[]) {
    const q = load(); const seen = new Set(q.map(key));
    for (const p of punches) if (!seen.has(key(p))) { q.push(p); seen.add(key(p)); }
    save(q); return q.length;
  },
  peek(n = 200) { return load().slice(0, n); },
  ack(punches: RawPunch[]) { const drop = new Set(punches.map(key)); save(load().filter((p) => !drop.has(key(p)))); },
  size() { return load().length; },
};
