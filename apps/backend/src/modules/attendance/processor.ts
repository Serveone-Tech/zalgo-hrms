// Section 58/62/63: raw punches → final attendance. Pure functions; DB access processor.service mein.
export type ShiftCfg = { startTime: string; endTime: string; graceMinutes: number; minWorkMinutes: number; halfDayMinutes: number; lateAfterMinutes: number; earlyOutBeforeMinutes: number; overtimeAfterMinutes: number; weekOffDays: number[] };
export type Punch = { at: Date; direction?: "in" | "out" | "unknown" | null };
export type DayContext = { date: string; tz: string; isHoliday: boolean; isOnLeave: boolean; isHalfDayLeave?: boolean; isWfh?: boolean };
export type Computed = { status: string; checkIn: Date | null; checkOut: Date | null; workMinutes: number; breakMinutes: number; lateMinutes: number; earlyOutMinutes: number; overtimeMinutes: number; punchCount: number };

const MIN = 60000;
export const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

// Shift window for a given attendance date (local time in tz). Night shift: end < start → ends next day.
export function shiftWindow(date: string, s: ShiftCfg, tz: string) {
  const start = zoned(date, s.startTime, tz);
  let end = zoned(date, s.endTime, tz);
  if (hm(s.endTime) <= hm(s.startTime)) end = new Date(end.getTime() + 24 * 60 * MIN);
  return { start, end, isNight: hm(s.endTime) <= hm(s.startTime) };
}
// Punch capture window: shift start − 4h … shift end + 6h (multi-punch, OT)
export function captureWindow(date: string, s: ShiftCfg, tz: string) {
  const { start, end } = shiftWindow(date, s, tz);
  return { from: new Date(start.getTime() - 4 * 60 * MIN), to: new Date(end.getTime() + 6 * 60 * MIN) };
}

export function computeDay(punches: Punch[], s: ShiftCfg, ctx: DayContext): Computed {
  const sorted = dedupe(punches).sort((a, b) => a.at.getTime() - b.at.getTime());
  const base: Computed = { status: "absent", checkIn: null, checkOut: null, workMinutes: 0, breakMinutes: 0, lateMinutes: 0, earlyOutMinutes: 0, overtimeMinutes: 0, punchCount: sorted.length };
  const dow = new Date(`${ctx.date}T12:00:00Z`).getUTCDay();
  const isWeekOff = s.weekOffDays.includes(dow);

  if (!sorted.length) {
    if (ctx.isOnLeave) return { ...base, status: "on_leave" };
    if (ctx.isHoliday) return { ...base, status: "holiday" };
    if (isWeekOff) return { ...base, status: "week_off" };
    if (ctx.isWfh) return { ...base, status: "work_from_home" };
    return base;
  }
  const { start, end } = shiftWindow(ctx.date, s, ctx.tz);
  const checkIn = sorted[0].at; const checkOut = sorted.length > 1 ? sorted[sorted.length - 1].at : null;
  // Multi-punch: pair IN/OUT sequentially; odd last punch = missing checkout
  let work = 0, brk = 0;
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    work += (sorted[i + 1].at.getTime() - sorted[i].at.getTime()) / MIN;
    if (i + 2 < sorted.length) brk += (sorted[i + 2].at.getTime() - sorted[i + 1].at.getTime()) / MIN;
  }
  work = Math.round(work); brk = Math.round(brk);
  const late = Math.max(0, Math.round((checkIn.getTime() - start.getTime()) / MIN));
  const earlyOut = checkOut ? Math.max(0, Math.round((end.getTime() - checkOut.getTime()) / MIN)) : 0;
  const overtime = work > s.overtimeAfterMinutes ? work - s.overtimeAfterMinutes : 0;

  let status = "present";
  if (sorted.length % 2 === 1) status = "missing_punch";
  else if (work < s.halfDayMinutes) status = "absent";
  else if (work < s.minWorkMinutes) status = "half_day";
  else if (late > s.lateAfterMinutes + s.graceMinutes) status = "late";
  else if (earlyOut > s.earlyOutBeforeMinutes) status = "early_out";
  if (ctx.isHalfDayLeave && status === "half_day") status = "present";
  if ((ctx.isHoliday || isWeekOff) && work > 0) status = "present"; // worked on holiday/week-off → present (+ OT = all work)

  return { status, checkIn, checkOut, workMinutes: work, breakMinutes: brk, lateMinutes: late > s.graceMinutes ? late : 0, earlyOutMinutes: earlyOut, overtimeMinutes: (ctx.isHoliday || isWeekOff) ? work : overtime, punchCount: sorted.length };
}

// Duplicate punch: same minute
function dedupe(p: Punch[]) {
  const seen = new Set<number>(); const out: Punch[] = [];
  for (const x of p) { const k = Math.floor(x.at.getTime() / MIN); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

// "YYYY-MM-DD" + "HH:mm" in IANA tz → Date (no deps). Compute offset via Intl.
export function zoned(date: string, time: string, tz: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}
export const ymd = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const addDays = (ymdStr: string, n: number) => { const d = new Date(`${ymdStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
