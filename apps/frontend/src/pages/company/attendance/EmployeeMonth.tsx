import { useState } from "react";
import { useGet } from "@/lib/queries";
import { Loading, Stat, Empty } from "@/components/ui/page";
import { fmtDate } from "@/lib/utils";
import { AttBadge, hhmm, hrs } from "./shared";

type Att = { id: string; date: string; status: string; checkIn: string | null; checkOut: string | null; workMinutes: number; lateMinutes: number; overtimeMinutes: number; isManual: boolean; remarks: string | null };
export function EmployeeMonth({ employeeId }: { employeeId: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, isLoading } = useGet<{ rows: Att[]; totals: { present: number; halfDay: number; absent: number; leave: number; late: number; workMinutes: number; overtimeMinutes: number } }>(["att-month", employeeId, month], `/attendance/monthly/${employeeId}?month=${month}`);
  if (isLoading || !data?.data) return <Loading />;
  const { rows, totals: t } = data.data;
  return (
    <div>
      <div className="flex items-center gap-3 mb-4"><input className="field w-44" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6 mb-4"><Stat label="Present" value={t.present} tone="good" /><Stat label="Half" value={t.halfDay} /><Stat label="Absent" value={t.absent} tone={t.absent ? "danger" : undefined} /><Stat label="Leave" value={t.leave} /><Stat label="Late" value={t.late} tone={t.late ? "warn" : undefined} /><Stat label="OT" value={hrs(t.overtimeMinutes)} /></div>
      {!rows.length ? <Empty text="No records this month." /> : <div className="card overflow-x-auto"><table className="w-full min-w-[560px]"><thead><tr><th className="th">Date</th><th className="th">In</th><th className="th">Out</th><th className="th">Worked</th><th className="th">Status</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td className="td">{fmtDate(r.date)}</td><td className="td tabular-nums">{hhmm(r.checkIn)}</td><td className="td tabular-nums">{hhmm(r.checkOut)}</td><td className="td tabular-nums">{r.workMinutes ? hrs(r.workMinutes) : "—"}</td><td className="td"><AttBadge s={r.status} />{r.isManual && <span className="ml-1 text-[10px] text-muted" title={r.remarks ?? ""}>manual</span>}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
