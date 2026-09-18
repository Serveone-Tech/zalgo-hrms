import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn, fmtDate } from "@/lib/utils";
import type { Branch } from "../employees/types";

export type Shift = { id: string; name: string; type: string; branchId: string | null; startTime: string; endTime: string; graceMinutes: number; minWorkMinutes: number; halfDayMinutes: number; lateAfterMinutes: number; earlyOutBeforeMinutes: number; overtimeAfterMinutes: number; weekOffDays: number[]; isDefault: boolean; isActive: boolean };
type Holiday = { id: string; name: string; date: string; branchId: string | null; isOptional: boolean };
type AttSettings = { selfCheckInEnabled: boolean; selfieRequired: boolean; gpsRequired: boolean; defaultGeofenceRadiusM: number; gpsAccuracyLimitM: number; activityTrackingEnabled: boolean; autoInactivityPauseEnabled: boolean; inactivityThresholdMinutes: number; manualBreakEnabled: boolean; autoCheckoutEnabled: boolean; allowMultiDeviceSessions: boolean };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const blank: Omit<Shift, "id"> = { name: "", type: "general", branchId: null, startTime: "09:30", endTime: "18:30", graceMinutes: 10, minWorkMinutes: 480, halfDayMinutes: 240, lateAfterMinutes: 10, earlyOutBeforeMinutes: 10, overtimeAfterMinutes: 540, weekOffDays: [0], isDefault: false, isActive: true };

export default function Shifts() {
  const can = useAuth((s) => s.can);
  const [tab, setTab] = useState<"shifts" | "holidays" | "settings">("shifts");
  const shiftsQ = useGet<Shift[]>(["shifts"], "/shifts"); const branches = useGet<Branch[]>(["branches"], "/branches");
  const year = new Date().getFullYear(); const hol = useGet<Holiday[]>(["holidays", year], `/shifts/holidays?year=${year}`);
  const act = useAction([["shifts"], ["holidays", year]]);
  const settingsQ = useGet<AttSettings>(["attendance-settings"], "/attendance/settings");
  const settingsAct = useAction<Partial<AttSettings>>([["attendance-settings"]]);
  const [cfg, setCfg] = useState<AttSettings | null>(null);
  useEffect(() => { if (settingsQ.data?.data) setCfg(settingsQ.data.data); }, [settingsQ.data]);
  const [m, setM] = useState<(Partial<Shift> & Omit<Shift, "id">) | null>(null);
  const [assign, setAssign] = useState<{ shift: Shift; ids: string; from: string } | null>(null);
  const [h, setH] = useState<{ name: string; date: string; branchId: string; isOptional: boolean } | null>(null);
  const emps = useGet<{ id: string; name: string; employeeCode: string }[]>(["managers"], "/employees/managers", !!assign);
  const bname = (id: string | null) => (id ? branches.data?.data?.find((b) => b.id === id)?.name : "All branches");
  const N = (k: keyof typeof blank, label: string) => <Field label={label}><input className="field" type="number" value={m![k] as number} onChange={(e) => setM({ ...m!, [k]: Number(e.target.value) })} /></Field>;

  return (
    <>
      <PageHeader title="Shifts & holidays" sub="Timing rules the attendance engine applies." actions={can("attendance.create") && (tab === "shifts" ? <Button onClick={() => setM({ ...blank })}><Plus size={16} /> Shift</Button> : tab === "holidays" ? <Button onClick={() => setH({ name: "", date: "", branchId: "", isOptional: false })}><Plus size={16} /> Holiday</Button> : null)} />
      <div className="flex gap-1 border-b border-line mb-5">{(["shifts", "holidays", "settings"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn("px-3 py-2 text-sm font-semibold border-b-2 -mb-px capitalize", tab === t ? "border-brand" : "border-transparent text-muted")}>{t === "settings" ? "Self check-in" : t}</button>)}</div>
      {tab === "settings" && (settingsQ.isLoading || !cfg ? <Loading /> : (
        <div className="card p-5 max-w-2xl space-y-5">
          <p className="text-sm text-muted">Controls the employee-facing "My attendance" self check-in screen — GPS, selfie, breaks and inactivity auto-pause. Features not in your subscription plan are disabled here.</p>
          {([
            ["selfCheckInEnabled", "Employee self check-in", "Employees can check in/out themselves from My attendance."],
            ["gpsRequired", "GPS attendance", "Require location for every self check-in, even on branches without a geofence."],
            ["selfieRequired", "Selfie attendance", "Require a selfie photo at check-in."],
            ["manualBreakEnabled", "Manual break", "Let employees start/end a lunch or personal break."],
            ["activityTrackingEnabled", "Activity tracking", "Detect mouse/keyboard activity while working (no content is ever recorded)."],
            ["autoInactivityPauseEnabled", "Automatic inactivity pause", "Auto-pause the work timer after the inactivity threshold below (requires Activity tracking)."],
            ["autoCheckoutEnabled", "Auto-checkout safety net", "Close a forgotten check-in left over from a previous day."],
            ["allowMultiDeviceSessions", "Allow multiple active sessions", "Let an employee check in from more than one device at once."],
          ] as const).map(([key, label, hint]) => (
            <label key={key} className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" checked={cfg[key]} onChange={(e) => setCfg({ ...cfg, [key]: e.target.checked })} />
              <span><span className="text-sm font-semibold block">{label}</span><span className="text-xs text-muted">{hint}</span></span>
            </label>
          ))}
          <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-line">
            <Field label="Default geofence radius (meters)"><input className="field" type="number" min={0} value={cfg.defaultGeofenceRadiusM} onChange={(e) => setCfg({ ...cfg, defaultGeofenceRadiusM: Number(e.target.value) })} /></Field>
            <Field label="GPS accuracy limit (meters)"><input className="field" type="number" min={0} value={cfg.gpsAccuracyLimitM} onChange={(e) => setCfg({ ...cfg, gpsAccuracyLimitM: Number(e.target.value) })} /></Field>
            <Field label="Inactivity threshold (minutes)"><input className="field" type="number" min={1} value={cfg.inactivityThresholdMinutes} onChange={(e) => setCfg({ ...cfg, inactivityThresholdMinutes: Number(e.target.value) })} /></Field>
          </div>
          <div className="flex justify-end"><Button loading={settingsAct.isPending} onClick={() => settingsAct.mutate({ method: "put", url: "/attendance/settings", body: cfg })}>Save settings</Button></div>
        </div>
      ))}
      {tab === "shifts" && (shiftsQ.isLoading ? <Loading /> : !shiftsQ.data?.data?.length ? <Empty text="No shifts yet. Create a General shift and mark it default." /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{shiftsQ.data.data.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-start justify-between"><div><h3 className="font-bold">{s.name} {s.isDefault && <Badge status="active" className="ml-1">Default</Badge>}</h3><p className="text-xs text-muted capitalize">{s.type} · {bname(s.branchId)}</p></div><div className="text-lg font-extrabold tabular-nums">{s.startTime}–{s.endTime}</div></div>
            <dl className="mt-3 text-[13px] grid grid-cols-2 gap-x-3 gap-y-1"><dt className="text-muted">Grace</dt><dd>{s.graceMinutes} min</dd><dt className="text-muted">Full day</dt><dd>{(s.minWorkMinutes / 60).toFixed(1)} h</dd><dt className="text-muted">Half day</dt><dd>{(s.halfDayMinutes / 60).toFixed(1)} h</dd><dt className="text-muted">OT after</dt><dd>{(s.overtimeAfterMinutes / 60).toFixed(1)} h</dd><dt className="text-muted">Week off</dt><dd>{s.weekOffDays.map((d) => DAYS[d]).join(", ") || "None"}</dd></dl>
            {can("attendance.create") && <div className="mt-3 flex gap-1"><Button size="sm" variant="ghost" onClick={() => setM({ ...s })}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setAssign({ shift: s, ids: "", from: new Date().toISOString().slice(0, 10) })}>Assign</Button><Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm(`Delete ${s.name}?`) && act.mutate({ method: "delete", url: `/shifts/${s.id}` })}>Delete</Button></div>}
          </div>))}</div>
      ))}
      {tab === "holidays" && (hol.isLoading ? <Loading /> : !hol.data?.data?.length ? <Empty text={`No holidays for ${year}.`} /> : <div className="card"><table className="w-full"><thead><tr><th className="th">Date</th><th className="th">Holiday</th><th className="th">Applies to</th><th className="th">Type</th><th className="th"></th></tr></thead>
        <tbody>{hol.data.data.map((x) => <tr key={x.id}><td className="td whitespace-nowrap">{fmtDate(x.date)}</td><td className="td font-semibold">{x.name}</td><td className="td text-muted">{bname(x.branchId)}</td><td className="td">{x.isOptional ? <Badge status="draft">Optional</Badge> : <Badge status="active">Paid</Badge>}</td><td className="td text-right">{can("attendance.create") && <Button size="sm" variant="ghost" className="text-danger" onClick={() => act.mutate({ method: "delete", url: `/shifts/holidays/${x.id}` })}>Remove</Button>}</td></tr>)}</tbody></table></div>)}

      <Modal open={!!m} onClose={() => setM(null)} title={m?.id ? `Edit ${m.name}` : "New shift"} wide>{m && <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Name"><input className="field" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></Field>
          <Field label="Type"><select className="field" value={m.type} onChange={(e) => setM({ ...m, type: e.target.value })}>{["general", "morning", "evening", "night", "flexible"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Branch"><select className="field" value={m.branchId ?? ""} onChange={(e) => setM({ ...m, branchId: e.target.value || null })}><option value="">All branches</option>{branches.data?.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Start"><input className="field" type="time" value={m.startTime} onChange={(e) => setM({ ...m, startTime: e.target.value })} /></Field>
          <Field label="End (before start = next day)"><input className="field" type="time" value={m.endTime} onChange={(e) => setM({ ...m, endTime: e.target.value })} /></Field>
          {N("graceMinutes", "Grace (min)")}{N("lateAfterMinutes", "Late after (min)")}{N("earlyOutBeforeMinutes", "Early out before (min)")}{N("minWorkMinutes", "Full day (min)")}{N("halfDayMinutes", "Half day (min)")}{N("overtimeAfterMinutes", "Overtime after (min)")}
        </div>
        <Field label="Week off"><div className="flex gap-1.5">{DAYS.map((d, i) => <button key={d} type="button" onClick={() => setM({ ...m, weekOffDays: m.weekOffDays.includes(i) ? m.weekOffDays.filter((x) => x !== i) : [...m.weekOffDays, i] })} className={cn("h-9 w-12 rounded-md border text-sm font-semibold", m.weekOffDays.includes(i) ? "border-brand bg-brand-soft text-brand" : "border-line text-muted")}>{d}</button>)}</div></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.isDefault} onChange={(e) => setM({ ...m, isDefault: e.target.checked })} /> Default shift (used when an employee has no assignment)</label>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setM(null)}>Cancel</Button><Button loading={act.isPending} disabled={m.name.length < 2} onClick={() => { const { id, ...body } = m; act.mutate({ method: id ? "put" : "post", url: id ? `/shifts/${id}` : "/shifts", body }, { onSuccess: () => setM(null) }); }}>Save shift</Button></div>
      </div>}</Modal>
      <Modal open={!!assign} onClose={() => setAssign(null)} title={`Assign ${assign?.shift.name}`}>{assign && <div className="space-y-4">
        <Field label="Employees"><select multiple className="field h-48" value={assign.ids.split(",").filter(Boolean)} onChange={(e) => setAssign({ ...assign, ids: [...e.target.selectedOptions].map((o) => o.value).join(",") })}>{emps.data?.data?.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.employeeCode})</option>)}</select></Field>
        <Field label="Effective from"><input className="field" type="date" value={assign.from} onChange={(e) => setAssign({ ...assign, from: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAssign(null)}>Cancel</Button><Button loading={act.isPending} disabled={!assign.ids} onClick={() => act.mutate({ url: `/shifts/${assign.shift.id}/assign`, body: { employeeIds: assign.ids.split(","), effectiveFrom: assign.from } }, { onSuccess: () => setAssign(null) })}>Assign</Button></div>
      </div>}</Modal>
      <Modal open={!!h} onClose={() => setH(null)} title="Add holiday">{h && <div className="space-y-4">
        <Field label="Name"><input className="field" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} /></Field>
        <Field label="Date"><input className="field" type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} /></Field>
        <Field label="Branch"><select className="field" value={h.branchId} onChange={(e) => setH({ ...h, branchId: e.target.value })}><option value="">Company-wide</option>{branches.data?.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={h.isOptional} onChange={(e) => setH({ ...h, isOptional: e.target.checked })} /> Optional / restricted holiday</label>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setH(null)}>Cancel</Button><Button loading={act.isPending} disabled={!h.name || !h.date} onClick={() => act.mutate({ url: "/shifts/holidays", body: { ...h, branchId: h.branchId || null } }, { onSuccess: () => setH(null) })}>Add</Button></div>
      </div>}</Modal>
    </>
  );
}
