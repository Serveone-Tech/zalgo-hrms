import { useState } from "react";
import { Plus } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn, fmtDate } from "@/lib/utils";
import { ApplyLeave } from "./ApplyLeave";
import { RequestList } from "./RequestList";
import type { Balance, LeaveReq, LeaveType } from "./types";

type Tab = "mine" | "approvals" | "all" | "calendar" | "types";
export default function Leaves() {
  const { can, user } = useAuth();
  const isHR = can("leave.approve"); const canView = can("leave.view");
  const [tab, setTab] = useState<Tab>("mine");
  const [apply, setApply] = useState<false | "me" | "other">(false);
  const bal = useGet<{ employeeId: string; year: number; balances: Balance[] } | null>(["leave-bal-me"], "/leaves/balances/me");
  const mine = useGet<LeaveReq[]>(["leave-req-me"], "/leaves/requests/me");
  const pending = useGet<LeaveReq[]>(["leave-pending"], "/leaves/requests/pending");
  const [status, setStatus] = useState("");
  const all = useGet<LeaveReq[]>(["leave-all", status], `/leaves/requests?status=${status}`, tab === "all" && canView);
  const tabs: { k: Tab; l: string; n?: number; show: boolean }[] = [
    { k: "mine", l: "My leaves", show: true }, { k: "approvals", l: "Approvals", n: pending.data?.data?.length, show: true },
    { k: "all", l: "All requests", show: canView }, { k: "calendar", l: "Calendar", show: true }, { k: "types", l: "Leave types", show: isHR },
  ];
  return (
    <>
      <PageHeader title="Leave" sub={user?.company?.name} actions={<>{isHR && <Button variant="secondary" onClick={() => setApply("other")}>Apply for employee</Button>}{can("leave.apply") && <Button onClick={() => setApply("me")}><Plus size={16} /> Apply leave</Button>}</>} />
      <div className="flex gap-1 border-b border-line mb-5 overflow-x-auto">{tabs.filter((t) => t.show).map((t) => <button key={t.k} onClick={() => setTab(t.k)} className={cn("px-3 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap", tab === t.k ? "border-brand" : "border-transparent text-muted")}>{t.l}{t.n ? <span className="ml-1.5 rounded-full bg-warn/15 text-warn px-1.5 text-[11px]">{t.n}</span> : null}</button>)}</div>

      {tab === "mine" && (bal.isLoading ? <Loading /> : !bal.data?.data ? <Empty text="Your login isn't linked to an employee record, so leave balances aren't available. Ask HR to link it." /> : <>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-6">{bal.data.data.balances.filter((b) => b.type.kind === "leave").map((b) => (
          <div key={b.id} className="card p-4"><div className="flex justify-between"><span className="text-[13px] font-semibold text-muted">{b.type.name}</span><span className="text-[11px] font-mono text-muted">{b.type.code}</span></div><div className="text-2xl font-extrabold mt-1 tabular-nums">{b.available}<span className="text-sm font-medium text-muted"> left</span></div><div className="text-xs text-muted mt-1">{Number(b.used)} used · {Number(b.allocated) + Number(b.carriedForward) + Number(b.adjusted)} total{Number(b.carriedForward) ? ` (${Number(b.carriedForward)} carried)` : ""}</div><div className="h-1.5 rounded bg-surface-2 mt-2"><div className="h-full rounded bg-brand" style={{ width: `${Math.min(100, (Number(b.used) / Math.max(1, Number(b.allocated) + Number(b.carriedForward) + Number(b.adjusted))) * 100)}%` }} /></div></div>))}
          {!bal.data.data.balances.length && <p className="text-sm text-muted col-span-full">No leave types configured yet{isHR ? " — open the Leave types tab." : "."}</p>}</div>
        {mine.isLoading ? <Loading /> : <RequestList rows={mine.data?.data ?? []} mode="mine" />}
      </>)}
      {tab === "approvals" && (pending.isLoading ? <Loading /> : <RequestList rows={pending.data?.data ?? []} mode="approve" showEmployee />)}
      {tab === "all" && <><div className="flex gap-1.5 mb-4">{["", "pending", "manager_approved", "approved", "rejected", "cancelled"].map((s) => <button key={s} onClick={() => setStatus(s)} className={cn("rounded-md px-2.5 h-8 text-[13px] font-semibold capitalize", status === s ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted")}>{s ? s.replace("_", " ") : "All"}</button>)}</div>{all.isLoading ? <Loading /> : <RequestList rows={all.data?.data ?? []} mode="all" showEmployee />}</>}
      {tab === "calendar" && <LeaveCalendar />}
      {tab === "types" && <LeaveTypes />}
      <Modal open={!!apply} onClose={() => setApply(false)} title={apply === "other" ? "Apply leave for an employee" : "Apply leave"} wide>{apply === "me" && <ApplyLeave onDone={() => setApply(false)} />}{apply === "other" && <ApplyForOther onDone={() => setApply(false)} />}</Modal>
    </>
  );
}

function ApplyForOther({ onDone }: { onDone: () => void }) {
  const emps = useGet<{ id: string; name: string; employeeCode: string }[]>(["managers"], "/employees/managers");
  const [id, setId] = useState("");
  return <div className="space-y-4"><Field label="Employee"><select className="field" value={id} onChange={(e) => setId(e.target.value)}><option value="">Select…</option>{emps.data?.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.employeeCode})</option>)}</select></Field>{id && <ApplyLeave employeeId={id} onDone={onDone} />}</div>;
}

function LeaveCalendar() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const from = `${month}-01`; const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate(); const to = `${month}-${String(last).padStart(2, "0")}`;
  const { data, isLoading } = useGet<LeaveReq[]>(["leave-cal", month], `/leaves/calendar?from=${from}&to=${to}`);
  const rows = data?.data ?? [];
  const days = Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const people = [...new Map(rows.map((r) => [r.employeeId, r])).values()];
  return (
    <div>
      <input className="field w-44 mb-4" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      {isLoading ? <Loading /> : !people.length ? <Empty text="No approved leave this month." /> : (
        <div className="card overflow-x-auto"><table className="text-xs"><thead><tr><th className="th sticky left-0 bg-surface min-w-[160px]">Employee</th>{days.map((d) => <th key={d} className="th px-1 text-center font-normal">{Number(d.slice(8))}</th>)}</tr></thead>
          <tbody>{people.map((p) => <tr key={p.employeeId}><td className="td sticky left-0 bg-surface font-semibold whitespace-nowrap">{p.employeeName}<div className="text-[10px] text-muted font-normal">{p.departmentName ?? ""}</div></td>{days.map((d) => { const r = rows.find((x) => x.employeeId === p.employeeId && x.fromDate <= d && x.toDate >= d); return <td key={d} className="td px-0.5 text-center" title={r ? `${r.typeName} ${fmtDate(r.fromDate)}–${fmtDate(r.toDate)}` : ""}>{r && <span className={cn("block h-5 rounded text-[10px] leading-5 font-semibold", r.typeKind === "wfh" ? "bg-brand-soft text-brand" : r.isPaid ? "bg-good/20 text-good" : "bg-warn/20 text-warn")}>{r.halfDay ? "½" : r.typeCode}</span>}</td>; })}</tr>)}</tbody></table></div>
      )}
    </div>
  );
}

function LeaveTypes() {
  const { data, isLoading } = useGet<LeaveType[]>(["leave-types"], "/leaves/types");
  const act = useAction([["leave-types"], ["leave-bal-me"]]);
  const [m, setM] = useState<Partial<LeaveType> | null>(null);
  const B = (k: keyof LeaveType, l: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!m![k]} onChange={(e) => setM({ ...m!, [k]: e.target.checked })} />{l}</label>;
  const N = (k: keyof LeaveType, l: string) => <Field label={l}><input className="field" type="number" step="0.5" value={(m![k] as any) ?? ""} onChange={(e) => setM({ ...m!, [k]: e.target.value })} /></Field>;
  return (
    <>
      <div className="flex justify-end gap-2 mb-4"><Button variant="secondary" size="sm" loading={act.isPending} onClick={() => act.mutate({ url: "/leaves/accrue" })}>Run accrual now</Button>{!data?.data?.length && <Button variant="secondary" size="sm" loading={act.isPending} onClick={() => act.mutate({ url: "/leaves/types/seed-defaults" })}>Create Indian defaults (CL, SL, EL, LWP, ML, PL, CO, WFH)</Button>}<Button size="sm" onClick={() => setM({ name: "", code: "", isPaid: true, kind: "leave", annualQuota: "12", accrual: "yearly", carryForwardMax: "0", allowHalfDay: true, approvalLevels: 1, minNoticeDays: 0, probationAllowed: true, isActive: true, sortOrder: 0 })}><Plus size={14} /> Leave type</Button></div>
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No leave types. Create defaults to get started." /> : <div className="card overflow-x-auto"><table className="w-full min-w-[720px]"><thead><tr><th className="th">Type</th><th className="th">Quota / yr</th><th className="th">Accrual</th><th className="th">Carry fwd</th><th className="th">Approval</th><th className="th">Rules</th><th className="th">Status</th><th className="th"></th></tr></thead>
        <tbody>{data.data.map((t) => <tr key={t.id}><td className="td font-semibold">{t.name} <span className="text-xs font-mono text-muted">{t.code}</span>{!t.isPaid && <Badge status="draft" className="ml-2">unpaid</Badge>}{t.kind !== "leave" && <Badge status="trial" className="ml-2">{t.kind.replace("_", " ")}</Badge>}</td><td className="td tabular-nums">{Number(t.annualQuota)}</td><td className="td capitalize">{t.accrual}</td><td className="td tabular-nums">{Number(t.carryForwardMax) || "—"}</td><td className="td">{t.approvalLevels === 2 ? "Manager + HR" : "Manager"}</td><td className="td text-xs text-muted">{[t.allowHalfDay && "half-day", t.encashable && "encashable", t.minNoticeDays && `${t.minNoticeDays}d notice`, t.maxConsecutiveDays && `max ${t.maxConsecutiveDays}`, t.applicableGenders?.length && t.applicableGenders.join("/"), !t.probationAllowed && "no probation"].filter(Boolean).join(" · ")}</td><td className="td"><Badge status={t.isActive ? "active" : "inactive"} /></td><td className="td text-right"><Button size="sm" variant="ghost" onClick={() => setM({ ...t })}>Edit</Button></td></tr>)}</tbody></table></div>}
      <Modal open={!!m} onClose={() => setM(null)} title={m?.id ? `Edit ${m.name}` : "New leave type"} wide>{m && <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Name"><input className="field" value={m.name ?? ""} onChange={(e) => setM({ ...m, name: e.target.value })} /></Field>
          <Field label="Code"><input className="field font-mono uppercase" value={m.code ?? ""} onChange={(e) => setM({ ...m, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Kind"><select className="field" value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value })}><option value="leave">Leave</option><option value="wfh">Work from home</option><option value="comp_off">Compensatory off</option></select></Field>
          {N("annualQuota", "Annual quota (days)")}
          <Field label="Accrual"><select className="field" value={m.accrual} onChange={(e) => setM({ ...m, accrual: e.target.value })}><option value="yearly">Yearly (full on Jan 1, pro-rata for joiners)</option><option value="monthly">Monthly (quota ÷ 12)</option><option value="none">None (manual / comp-off)</option></select></Field>
          {N("carryForwardMax", "Max carry forward")}{N("minNoticeDays", "Min notice (days)")}{N("maxConsecutiveDays", "Max consecutive days")}
          <Field label="Approval levels"><select className="field" value={m.approvalLevels} onChange={(e) => setM({ ...m, approvalLevels: Number(e.target.value) })}><option value={1}>Manager only</option><option value={2}>Manager then HR</option></select></Field>
          <Field label="Applicable to"><select className="field" value={m.applicableGenders?.[0] ?? ""} onChange={(e) => setM({ ...m, applicableGenders: e.target.value ? [e.target.value] : null })}><option value="">Everyone</option><option value="female">Female only</option><option value="male">Male only</option></select></Field>
          {N("sortOrder", "Sort order")}
        </div>
        <div className="grid sm:grid-cols-3 gap-2">{B("isPaid", "Paid leave")}{B("allowHalfDay", "Allow half day")}{B("allowNegative", "Allow without balance")}{B("encashable", "Encashable")}{B("probationAllowed", "Allowed during probation")}{B("isActive", "Active")}</div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setM(null)}>Cancel</Button><Button loading={act.isPending} disabled={!m.name || !m.code} onClick={() => { const { id, ...body } = m as any; act.mutate({ method: id ? "put" : "post", url: id ? `/leaves/types/${id}` : "/leaves/types", body: { ...body, maxConsecutiveDays: body.maxConsecutiveDays ? Number(body.maxConsecutiveDays) : null } }, { onSuccess: () => setM(null) }); }}>Save</Button></div>
      </div>}</Modal>
    </>
  );
}
