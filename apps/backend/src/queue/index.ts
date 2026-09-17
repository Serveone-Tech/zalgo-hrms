// Section 109: background jobs. Default = in-process queue with retry (zero setup).
// REDIS_URL set karo aur `pnpm add bullmq ioredis` karo to same interface BullMQ par chal jata hai (queue/bull.ts).
type Job = { name: string; data: any; attempts: number };
type Handler = (data: any) => Promise<void>;
const handlers = new Map<string, Handler>();
const q: Job[] = []; let running = false;
export const registerJob = (name: string, h: Handler) => handlers.set(name, h);
export const enqueue = (name: string, data: any) => { q.push({ name, data, attempts: 0 }); void drain(); };
async function drain() {
  if (running) return; running = true;
  while (q.length) {
    const job = q.shift()!; const h = handlers.get(job.name);
    if (!h) { console.warn(`queue: no handler for ${job.name}`); continue; }
    try { await h(job.data); }
    catch (e: any) { job.attempts++; if (job.attempts < 3) { setTimeout(() => { q.push(job); void drain(); }, 5000 * job.attempts); } else console.error(`queue: ${job.name} failed after 3 attempts`, e?.message); }
  }
  running = false;
}
export const queueStats = () => ({ pending: q.length, handlers: [...handlers.keys()] });
