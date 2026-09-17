import { useState } from "react";
import { useGet, useAction } from "@/lib/queries";
import { PageHeader, Loading, Stat, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/utils";
import { AttBadge, hhmm, hrs } from "./shared";

type Att = { id: string; date: string; status: string; checkIn: string | null; checkOut: string | null; workMinutes: number; lateMinutes: number; overtimeMinutes: number };
type Me = { employeeId: string; today: string; rows: Att[]; todayLogs: { id: string; punchedAt: string; source: string }[] };

export default function MyAttendance() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, isLoading } = useGet<Me | null>(["my-attendance", month], `/attendance/me?month=${month}`);
  const act = useAction([["my-attendance"]]);
  const [busy, setBusy] = useState(false);
  if (isLoading) return <Loading />;
  const d = data?.data;
  if (!d) return <><PageHeader title="My attendance" /><Empty text="Your login isn't linked to an employee record. Ask HR to link it." /></>;
  const punch = () => {
    setBusy(true);
    const go = (pos?: GeolocationPosition) => act.mutate({ url: "/attendance/punch", body: pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : {} }, { onSettled: () => setBusy(false) });
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(go, () => go(), { timeout: 5000 }); else go();
  };
  const t = d.rows.reduce((a, r) => ({ p: a.p + (["present", "late", "early_out", "work_from_home"].includes(r.status) ? 1 : 0), h: a.h + (r.status === "half_day" ? 1 : 0), a: a.a + (r.status === "absent" ? 1 : 0), l: a.l + (r.status === "late" ? 1 : 0), w: a.w + r.workMinutes }), { p: 0, h: 0, a: 0, l: 0, w: 0 });
  const odd = d.todayLogs.length % 2 === 1;
  return (
    <>
      <PageHeader title="My attendance" sub={fmtDate(d.today)} actions={<Button size="lg" loading={busy || act.isPending} onClick={punch} variant={odd ? "secondary" : "primary"}>{odd ? "Check out" : "Check in"}</Button>} />
      <div className="card p-4 mb-5 flex flex-wrap items-center gap-4"><span className="text-sm font-semibold">Today's punches</span>{d.todayLogs.length ? d.todayLogs.map((l, i) => <span key={l.id} className="text-sm tabular-nums rounded bg-surface-2 px-2 py-1">{i % 2 === 0 ? "In" : "Out"} {hhmm(l.punchedAt)} <span className="text-muted text-xs">({l.source})</span></span>) : <span className="text-sm text-muted">Not checked in yet.</span>}</div>
      <div className="flex items-center gap-3 mb-4"><input className="field w-44" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-5"><Stat label="Present" value={t.p} tone="good" /><Stat label="Half days" value={t.h} /><Stat label="Absent" value={t.a} tone={t.a ? "danger" : undefined} /><Stat label="Late" value={t.l} tone={t.l ? "warn" : undefined} /><Stat label="Hours" value={hrs(t.w)} /></div>
      {!d.rows.length ? <Empty text="No attendance records this month." /> : <div className="card overflow-x-auto"><table className="w-full min-w-[520px]"><thead><tr><th className="th">Date</th><th className="th">In</th><th className="th">Out</th><th className="th">Worked</th><th className="th">Status</th></tr></thead>
        <tbody>{d.rows.map((r) => <tr key={r.id}><td className="td">{fmtDate(r.date)}</td><td className="td tabular-nums">{hhmm(r.checkIn)}</td><td className="td tabular-nums">{hhmm(r.checkOut)}</td><td className="td tabular-nums">{r.workMinutes ? hrs(r.workMinutes) : "—"}</td><td className="td"><AttBadge s={r.status} />{r.lateMinutes > 0 && <span className="ml-2 text-xs text-warn">+{r.lateMinutes}m</span>}</td></tr>)}</tbody></table></div>}
    </>
  );
}
