import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fmtDate } from "@/lib/utils";
import { AttBadge, ATT_LABEL, hhmm, hrs, todayStr } from "./shared";
import type { Branch, Dept } from "../employees/types";

type Row = { employeeId: string; employeeCode: string; name: string; branchName: string | null; departmentName: string | null; designationName: string | null; id: string | null; status: string | null; checkIn: string | null; checkOut: string | null; workMinutes: number | null; lateMinutes: number | null; overtimeMinutes: number | null; punchCount: number | null; isManual: boolean | null; source: string | null; remarks: string | null; shiftName: string | null };
type Log = { id: string; punchedAt: string; direction: string; source: string; ip: string | null };

export default function Attendance() {
  const can = useAuth((s) => s.can);
  const [date, setDate] = useState(todayStr()); const [branchId, setBranchId] = useState(""); const [departmentId, setDepartmentId] = useState(""); const [filter, setFilter] = useState("");
  const { data, isLoading } = useGet<{ date: string; rows: Row[]; summary: Record<string, number> }>(["attendance-daily", date, branchId, departmentId], `/attendance/daily?date=${date}&branchId=${branchId}&departmentId=${departmentId}`);
  const branches = useGet<Branch[]>(["branches"], "/branches"); const depts = useGet<Dept[]>(["departments"], "/departments");
  const act = useAction([["attendance-daily"], ["company-dashboard"], ["att-logs"]]);
  const [sel, setSel] = useState<Row | null>(null);
  const logs = useGet<Log[]>(["att-logs", sel?.employeeId, date], `/attendance/logs?employeeId=${sel?.employeeId}&date=${date}`, !!sel);
  const [reg, setReg] = useState<{ status: string; checkIn: string; checkOut: string; remarks: string } | null>(null);
  const [punch, setPunch] = useState<{ time: string; direction: string } | null>(null);
  const rows = (data?.data?.rows ?? []).filter((r) => !filter || (r.status ?? "not_processed") === filter);
  const sum = data?.data?.summary ?? {};

  return (
    <>
      <PageHeader title="Attendance" sub={fmtDate(date)} actions={can("attendance.approve") && <Button variant="secondary" loading={act.isPending} onClick={() => act.mutate({ url: "/attendance/process", body: { date } })}><RefreshCw size={15} /> Recompute day</Button>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <input className="field w-44" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="field w-44" value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">All branches</option>{branches.data?.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className="field w-44" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">All departments</option>{depts.data?.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">{["", ...Object.keys(ATT_LABEL)].filter((k) => !k || sum[k]).map((k) => <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-2.5 h-8 text-[13px] font-semibold ${filter === k ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted hover:text-ink"}`}>{k ? `${ATT_LABEL[k]} ${sum[k]}` : `All ${data?.data?.rows.length ?? 0}`}</button>)}</div>
      {isLoading ? <Loading /> : !rows.length ? <Empty text="No employees for this filter." /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[900px]">
          <thead><tr><th className="th">Employee</th><th className="th">Shift</th><th className="th">In</th><th className="th">Out</th><th className="th">Worked</th><th className="th">Late</th><th className="th">OT</th><th className="th">Punches</th><th className="th">Status</th><th className="th"></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.employeeId} className="hover:bg-surface-2/60">
            <td className="td"><Link to={`/app/employees/${r.employeeId}`} className="font-semibold hover:text-brand">{r.name}</Link><div className="text-xs text-muted">{r.employeeCode} · {r.departmentName ?? "—"} · {r.branchName}</div></td>
            <td className="td text-muted">{r.shiftName ?? "—"}</td><td className="td tabular-nums">{hhmm(r.checkIn)}</td><td className="td tabular-nums">{hhmm(r.checkOut)}</td><td className="td tabular-nums">{r.workMinutes ? hrs(r.workMinutes) : "—"}</td>
            <td className="td tabular-nums text-warn">{r.lateMinutes ? `${r.lateMinutes}m` : ""}</td><td className="td tabular-nums text-good">{r.overtimeMinutes ? hrs(r.overtimeMinutes) : ""}</td><td className="td tabular-nums">{r.punchCount ?? 0}</td>
            <td className="td"><AttBadge s={r.status} />{r.isManual && <span className="ml-1 text-[10px] text-muted" title={r.remarks ?? ""}>manual</span>}</td>
            <td className="td text-right"><Button size="sm" variant="ghost" onClick={() => setSel(r)}>Details</Button></td>
          </tr>)}</tbody></table></div>
      )}
      <Modal open={!!sel} onClose={() => { setSel(null); setReg(null); setPunch(null); }} title={sel ? `${sel.name} · ${fmtDate(date)}` : ""} wide>{sel && <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3"><AttBadge s={sel.status} /><span className="text-sm text-muted">{sel.shiftName ?? "No shift"} · {hhmm(sel.checkIn)} → {hhmm(sel.checkOut)} · {hrs(sel.workMinutes ?? 0)}</span>{sel.remarks && <span className="text-sm">— {sel.remarks}</span>}</div>
        <div><h3 className="font-bold text-sm mb-2">Raw punches</h3>{!logs.data?.data?.length ? <p className="text-sm text-muted">No punches recorded.</p> : <table className="w-full"><tbody>{logs.data.data.map((l) => <tr key={l.id}><td className="td tabular-nums">{new Date(l.punchedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td className="td capitalize text-muted">{l.direction}</td><td className="td capitalize">{l.source}</td><td className="td text-xs text-muted">{l.ip ?? ""}</td><td className="td text-right">{can("attendance.approve") && ["manual", "web"].includes(l.source) && <Button size="sm" variant="ghost" className="text-danger" onClick={() => act.mutate({ method: "delete", url: `/attendance/logs/${l.id}` })}>Remove</Button>}</td></tr>)}</tbody></table>}</div>
        <div className="flex flex-wrap gap-2">
          {can("attendance.create") && <Button size="sm" variant="secondary" onClick={() => setPunch({ time: `${date}T09:30`, direction: "unknown" })}>Add punch</Button>}
          {can("attendance.approve") && <Button size="sm" variant="secondary" onClick={() => setReg({ status: sel.status ?? "present", checkIn: sel.checkIn ? sel.checkIn.slice(0, 16) : `${date}T09:30`, checkOut: sel.checkOut ? sel.checkOut.slice(0, 16) : `${date}T18:30`, remarks: "" })}>Regularise</Button>}
          {can("attendance.approve") && sel.isManual && <Button size="sm" variant="ghost" onClick={() => act.mutate({ url: "/attendance/unlock", body: { employeeId: sel.employeeId, date } }, { onSuccess: () => setSel(null) })}>Unlock & recompute</Button>}
        </div>
        {punch && <div className="card p-4 grid sm:grid-cols-3 gap-3 items-end"><Field label="Punch time"><input className="field" type="datetime-local" value={punch.time} onChange={(e) => setPunch({ ...punch, time: e.target.value })} /></Field><Field label="Direction"><select className="field" value={punch.direction} onChange={(e) => setPunch({ ...punch, direction: e.target.value })}><option value="unknown">Auto</option><option value="in">In</option><option value="out">Out</option></select></Field><Button loading={act.isPending} onClick={() => act.mutate({ url: "/attendance/manual-punch", body: { employeeId: sel.employeeId, punchedAt: new Date(punch.time).toISOString(), direction: punch.direction } }, { onSuccess: () => setPunch(null) })}>Add punch</Button></div>}
        {reg && <div className="card p-4 space-y-3"><div className="grid sm:grid-cols-3 gap-3"><Field label="Status"><select className="field" value={reg.status} onChange={(e) => setReg({ ...reg, status: e.target.value })}>{["present", "absent", "half_day", "late", "work_from_home", "on_leave", "holiday", "week_off"].map((s) => <option key={s} value={s}>{ATT_LABEL[s]}</option>)}</select></Field><Field label="Check in"><input className="field" type="datetime-local" value={reg.checkIn} onChange={(e) => setReg({ ...reg, checkIn: e.target.value })} /></Field><Field label="Check out"><input className="field" type="datetime-local" value={reg.checkOut} onChange={(e) => setReg({ ...reg, checkOut: e.target.value })} /></Field></div><Field label="Reason (required)"><input className="field" value={reg.remarks} onChange={(e) => setReg({ ...reg, remarks: e.target.value })} /></Field><p className="text-xs text-muted">Regularised days are locked — the processor won't overwrite them until you unlock.</p><div className="flex justify-end"><Button loading={act.isPending} disabled={reg.remarks.length < 2} onClick={() => act.mutate({ url: "/attendance/regularise", body: { employeeId: sel.employeeId, date, status: reg.status, checkIn: ["absent", "on_leave", "holiday", "week_off"].includes(reg.status) ? null : new Date(reg.checkIn).toISOString(), checkOut: ["absent", "on_leave", "holiday", "week_off"].includes(reg.status) ? null : new Date(reg.checkOut).toISOString(), remarks: reg.remarks } }, { onSuccess: () => { setReg(null); setSel(null); } })}>Save</Button></div></div>}
      </div>}</Modal>
    </>
  );
}
