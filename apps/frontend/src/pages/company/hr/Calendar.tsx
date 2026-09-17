import { useState } from "react";
import { useGet } from "@/lib/queries";
import { PageHeader, Loading } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Ev = { date: string; type: string; title: string; sub?: string };
const color: Record<string, string> = { holiday: "bg-danger/15 text-danger", leave: "bg-warn/15 text-warn", birthday: "bg-brand-soft text-brand", anniversary: "bg-good/15 text-good", interview: "bg-surface-2 text-ink", event: "bg-brand text-brand-ink" };
export default function CalendarPage() {
  const [ym, setYm] = useState(new Date().toISOString().slice(0, 7));
  const y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7)); const last = new Date(y, mo, 0).getDate(); const first = new Date(y, mo - 1, 1).getDay();
  const { data, isLoading } = useGet<Ev[]>(["cal", ym], `/announcements/calendar?from=${ym}-01&to=${ym}-${String(last).padStart(2, "0")}`);
  const byDate = (data?.data ?? []).reduce<Record<string, Ev[]>>((a, e) => { (a[e.date] ??= []).push(e); return a; }, {});
  const shift = (n: number) => { const d = new Date(y, mo - 1 + n, 1); setYm(d.toISOString().slice(0, 7)); };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Calendar" sub="Holidays, leaves, birthdays, work anniversaries, interviews and events." actions={<div className="flex items-center gap-2"><Button size="sm" variant="secondary" onClick={() => shift(-1)}>‹</Button><span className="font-bold w-36 text-center">{new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span><Button size="sm" variant="secondary" onClick={() => shift(1)}>›</Button></div>} />
      <div className="flex flex-wrap gap-2 mb-3 text-xs">{Object.entries(color).map(([k, c]) => <span key={k} className={cn("rounded px-2 py-0.5 capitalize", c)}>{k}</span>)}</div>
      {isLoading ? <Loading /> : <div className="card overflow-hidden"><div className="grid grid-cols-7 text-center text-[12px] font-semibold text-muted border-b border-line">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
        <div className="grid grid-cols-7">{Array.from({ length: first }).map((_, i) => <div key={"e" + i} className="min-h-[92px] border-b border-r border-line/60 bg-surface-2/40" />)}{Array.from({ length: last }, (_, i) => { const d = `${ym}-${String(i + 1).padStart(2, "0")}`; const ev = byDate[d] ?? []; return <div key={d} className={cn("min-h-[92px] border-b border-r border-line/60 p-1.5", d === today && "bg-brand-soft/40")}><div className={cn("text-xs font-semibold mb-1", d === today ? "text-brand" : "text-muted")}>{i + 1}</div><div className="space-y-0.5">{ev.slice(0, 3).map((e, j) => <div key={j} title={`${e.title}${e.sub ? " · " + e.sub : ""}`} className={cn("truncate rounded px-1 text-[11px] leading-5", color[e.type])}>{e.type === "birthday" ? "🎂 " : e.type === "anniversary" ? "🎉 " : ""}{e.title}{e.sub && e.type === "leave" ? ` (${e.sub})` : ""}</div>)}{ev.length > 3 && <div className="text-[10px] text-muted">+{ev.length - 3} more</div>}</div></div>; })}</div></div>}
    </>
  );
}
