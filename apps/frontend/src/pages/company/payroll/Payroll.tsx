import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Download } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { API_URL, api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Empty, Field, Stat } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn, inr, fmtDate } from "@/lib/utils";
import { PayBreakdown } from "./PayBreakdown";
import { RSTATUS, rtone, monthLabel, type Run, type Item, type Comp } from "./types";
import type { Branch } from "../employees/types";

type Tab = "runs" | "advances" | "components" | "settings";
export default function Payroll() {
  const can = useAuth((s) => s.can);
  const [tab, setTab] = useState<Tab>("runs");
  const [runId, setRunId] = useState<string | null>(null);
  const tabs: { k: Tab; l: string }[] = [{ k: "runs", l: "Payroll runs" }, { k: "advances", l: "Advances & loans" }, { k: "components", l: "Components" }, { k: "settings", l: "Statutory settings" }];
  if (runId) return <RunDetail id={runId} back={() => setRunId(null)} />;
  return (
    <>
      <PageHeader title="Payroll" sub="Process, approve and pay monthly salaries." />
      <div className="flex gap-1 border-b border-line mb-5">{tabs.map((t) => <button key={t.k} onClick={() => setTab(t.k)} className={cn("px-3 py-2 text-sm font-semibold border-b-2 -mb-px", tab === t.k ? "border-brand" : "border-transparent text-muted")}>{t.l}</button>)}</div>
      {tab === "runs" && <Runs open={setRunId} />}{tab === "advances" && <Advances />}{tab === "components" && <Components />}{tab === "settings" && <Settings />}
      {!can("payroll.view") && null}
    </>
  );
}

function Runs({ open }: { open: (id: string) => void }) {
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<Run[]>(["pay-runs"], "/payroll/runs"); const branches = useGet<Branch[]>(["branches"], "/branches");
  const act = useAction<any, { id: string }>([["pay-runs"]]);
  const [m, setM] = useState<{ month: string; branchId: string } | null>(null);
  return (
    <>
      {can("payroll.process") && <div className="flex justify-end mb-4"><Button onClick={() => { const d = new Date(); d.setMonth(d.getMonth() - 1); setM({ month: d.toISOString().slice(0, 7), branchId: "" }); }}><Plus size={16} /> Run payroll</Button></div>}
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No payroll runs yet. Set salary structures on employee profiles, then run payroll for a month." /> : <div className="card overflow-x-auto"><table className="w-full min-w-[720px]"><thead><tr><th className="th">Month</th><th className="th">Scope</th><th className="th">Employees</th><th className="th">Gross</th><th className="th">Deductions</th><th className="th">Net payable</th><th className="th">Status</th></tr></thead>
        <tbody>{data.data.map((r) => <tr key={r.id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => open(r.id)}><td className="td font-semibold">{monthLabel(r.month)}</td><td className="td text-muted">{r.branchName ?? "All branches"}</td><td className="td tabular-nums">{r.employeeCount}</td><td className="td tabular-nums">{inr(r.totalGross)}</td><td className="td tabular-nums">{inr(r.totalDeductions)}</td><td className="td tabular-nums font-bold">{inr(r.totalNet)}</td><td className="td"><Badge status={rtone[r.status]}>{RSTATUS[r.status]}</Badge></td></tr>)}</tbody></table></div>}
      <Modal open={!!m} onClose={() => setM(null)} title="Run payroll">{m && <div className="space-y-4"><Field label="Month"><input className="field" type="month" value={m.month} onChange={(e) => setM({ ...m, month: e.target.value })} /></Field><Field label="Branch"><select className="field" value={m.branchId} onChange={(e) => setM({ ...m, branchId: e.target.value })}><option value="">All branches</option>{branches.data?.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><p className="text-xs text-muted">Computes salary for every employee with a structure: attendance → payable days → prorated earnings → PF/ESI/PT/TDS/advances. You can review, hold individuals, reprocess, then approve and mark paid.</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setM(null)}>Cancel</Button><Button loading={act.isPending} onClick={() => act.mutate({ url: "/payroll/runs", body: { month: m.month, branchId: m.branchId || null } }, { onSuccess: (r) => { setM(null); if (r.data?.id) open(r.data.id); } })}>Process</Button></div></div>}</Modal>
    </>
  );
}

function RunDetail({ id, back }: { id: string; back: () => void }) {
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<Run & { items: Item[] }>(["pay-run", id], `/payroll/runs/${id}`);
  const act = useAction([["pay-run", id], ["pay-runs"]]);
  const [sel, setSel] = useState<Item | null>(null);
  if (isLoading || !data?.data) return <Loading />;
  const r = data.data; const locked = ["approved", "paid"].includes(r.status);
  const dl = async (path: string, name: string) => { const res = await api.get(path, { responseType: "blob" }); const u = URL.createObjectURL(res.data); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); };
  const slip = async (itemId: string) => { const res = await api.get(`/payroll/payslips/${itemId}`, { responseType: "blob" }); window.open(URL.createObjectURL(res.data), "_blank"); };
  return (
    <>
      <button onClick={back} className="text-sm text-muted hover:text-ink">← Payroll runs</button>
      <PageHeader title={`Payroll · ${monthLabel(r.month)}`} sub={`${r.branchName ?? "All branches"} · ${r.employeeCount} employees${r.processedAt ? ` · processed ${fmtDate(r.processedAt)}` : ""}`} actions={<>
        {can("payroll.process") && !locked && <Button variant="secondary" loading={act.isPending} onClick={() => act.mutate({ url: `/payroll/runs/${id}/reprocess` })}>Reprocess</Button>}
        {can("payroll.approve") && r.status === "pending_approval" && <Button loading={act.isPending} onClick={() => confirm(`Approve payroll of ${inr(r.totalNet)}?`) && act.mutate({ url: `/payroll/runs/${id}/approve` })}>Approve</Button>}
        {can("payroll.approve") && r.status === "approved" && <><Button variant="secondary" onClick={() => dl(`/payroll/runs/${id}/bank-sheet.csv`, `bank-sheet-${r.month}.csv`)}><Download size={14} /> Bank sheet</Button><Button loading={act.isPending} onClick={() => confirm("Mark as paid? Payslips become visible to employees.") && act.mutate({ url: `/payroll/runs/${id}/pay` })}>Mark paid</Button></>}
        {can("payroll.approve") && r.status !== "paid" && <Button variant="ghost" onClick={() => confirm("Delete this run?") && act.mutate({ url: `/payroll/runs/${id}/cancel` }, { onSuccess: back })}>Delete</Button>}
      </>} />
      <div className="flex items-center gap-2 mb-4"><Badge status={rtone[r.status]}>{RSTATUS[r.status]}</Badge>{r.paidAt && <span className="text-sm text-muted">paid {fmtDate(r.paidAt)}</span>}</div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5"><Stat label="Gross" value={inr(r.totalGross)} /><Stat label="Deductions" value={inr(r.totalDeductions)} /><Stat label="Net payable" value={inr(r.totalNet)} tone="good" /><Stat label="Employer cost" value={inr(r.totalEmployerCost)} hint="incl. employer PF/ESI" /></div>
      {!r.items.length ? <Empty text="No employees had a salary structure for this month." /> : <div className="card overflow-x-auto"><table className="w-full min-w-[900px]"><thead><tr><th className="th">Employee</th><th className="th">Payable / LOP</th><th className="th">Gross</th><th className="th">PF</th><th className="th">ESI</th><th className="th">PT</th><th className="th">TDS</th><th className="th">Other</th><th className="th">Net</th><th className="th">Status</th><th className="th"></th></tr></thead>
        <tbody>{r.items.map((it) => { const d = (c: string) => it.deductions.find((x) => x.code === c)?.amount ?? 0; const other = Number(it.totalDeductions) - d("PF") - d("ESI") - d("PT") - d("TDS"); return <tr key={it.id} className={cn("hover:bg-surface-2/60", it.status === "held" && "opacity-60")}>
          <td className="td"><Link to={`/app/employees/${it.employeeId}`} className="font-semibold hover:text-brand">{it.employeeName}</Link><div className="text-xs text-muted">{it.employeeCode} · {it.designationName ?? "—"}</div></td>
          <td className="td tabular-nums">{Number(it.payableDays)} / <span className={Number(it.lopDays) ? "text-danger" : ""}>{Number(it.lopDays)}</span></td><td className="td tabular-nums">{inr(it.gross)}</td><td className="td tabular-nums">{d("PF") || "—"}</td><td className="td tabular-nums">{d("ESI") || "—"}</td><td className="td tabular-nums">{d("PT") || "—"}</td><td className="td tabular-nums">{d("TDS") || "—"}</td><td className="td tabular-nums">{other ? inr(other) : "—"}</td><td className="td tabular-nums font-bold">{inr(it.net)}</td>
          <td className="td"><Badge status={it.status === "paid" ? "approved" : it.status === "held" ? "suspended" : "active"}>{it.status}</Badge></td>
          <td className="td text-right whitespace-nowrap"><Button size="sm" variant="ghost" onClick={() => setSel(it)}>Details</Button><Button size="sm" variant="ghost" onClick={() => slip(it.id)}>Payslip</Button></td></tr>; })}</tbody></table></div>}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.employeeName} · ${monthLabel(r.month)}` : ""} wide>{sel && <div className="space-y-4">
        <div className="rounded-md bg-surface-2 p-3 text-sm grid grid-cols-3 sm:grid-cols-6 gap-2">{Object.entries({ Present: sel.attendance.present, "Half day": sel.attendance.halfDay, Absent: sel.attendance.absent, "Paid leave": sel.attendance.paidLeave, "Unpaid leave": sel.attendance.unpaidLeave, "Hol/WO": sel.attendance.holidays + sel.attendance.weekOffs }).map(([k, v]) => <div key={k}><div className="text-xs text-muted">{k}</div><div className="font-bold">{v}</div></div>)}</div>
        <PayBreakdown p={{ earnings: sel.earnings, deductions: sel.deductions, employer: sel.employer, gross: Number(sel.gross), totalDeductions: Number(sel.totalDeductions), net: Number(sel.net), employerCost: Number(sel.employerCost) }} />
        {sel.bankSnapshot?.accountNumber && <p className="text-xs text-muted">Bank: {sel.bankSnapshot.bankName} · {sel.bankSnapshot.accountNumber} · {sel.bankSnapshot.ifsc}</p>}
        {sel.remarks && <p className="text-sm">Remarks: {sel.remarks}</p>}
        {can("payroll.process") && !locked && <div className="flex justify-end">{sel.status === "held" ? <Button size="sm" onClick={() => act.mutate({ url: `/payroll/runs/${id}/items/${sel.id}/hold`, body: { hold: false } }, { onSuccess: () => setSel(null) })}>Release salary</Button> : <Button size="sm" variant="secondary" onClick={() => { const remarks = prompt("Reason for holding salary?"); if (remarks) act.mutate({ url: `/payroll/runs/${id}/items/${sel.id}/hold`, body: { hold: true, remarks } }, { onSuccess: () => setSel(null) }); }}>Hold salary</Button>}</div>}
      </div>}</Modal>
    </>
  );
}

function Advances() {
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<any[]>(["advances"], "/payroll/advances"); const emps = useGet<{ id: string; name: string; employeeCode: string }[]>(["managers"], "/employees/managers");
  const act = useAction([["advances"]]);
  const [m, setM] = useState<{ employeeId: string; type: string; amount: string; installment: string; startMonth: string; note: string } | null>(null);
  return (
    <>
      {can("payroll.process") && <div className="flex justify-end mb-4"><Button onClick={() => setM({ employeeId: "", type: "advance", amount: "", installment: "", startMonth: new Date().toISOString().slice(0, 7), note: "" })}><Plus size={16} /> Advance / loan</Button></div>}
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No advances or loans." /> : <div className="card"><table className="w-full"><thead><tr><th className="th">Employee</th><th className="th">Type</th><th className="th">Amount</th><th className="th">Per month</th><th className="th">Recovered</th><th className="th">From</th><th className="th">Status</th><th className="th"></th></tr></thead>
        <tbody>{data.data.map((a) => <tr key={a.id}><td className="td font-semibold">{a.employeeName}<div className="text-xs text-muted">{a.employeeCode}</div></td><td className="td capitalize">{a.type}</td><td className="td tabular-nums">{inr(a.amount)}</td><td className="td tabular-nums">{inr(a.installment)}</td><td className="td tabular-nums">{inr(a.recovered)}</td><td className="td">{monthLabel(a.startMonth)}</td><td className="td"><Badge status={a.status === "active" ? "pending" : "approved"}>{a.status}</Badge></td><td className="td text-right">{can("payroll.process") && a.status === "active" && <Button size="sm" variant="ghost" onClick={() => act.mutate({ url: `/payroll/advances/${a.id}/close` })}>Close</Button>}</td></tr>)}</tbody></table></div>}
      <Modal open={!!m} onClose={() => setM(null)} title="Record advance / loan">{m && <div className="space-y-4"><Field label="Employee"><select className="field" value={m.employeeId} onChange={(e) => setM({ ...m, employeeId: e.target.value })}><option value="">Select…</option>{emps.data?.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.employeeCode})</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Type"><select className="field" value={m.type} onChange={(e) => setM({ ...m, type: e.target.value })}><option value="advance">Salary advance</option><option value="loan">Loan</option></select></Field><Field label="Recover from"><input className="field" type="month" value={m.startMonth} onChange={(e) => setM({ ...m, startMonth: e.target.value })} /></Field><Field label="Total amount (₹)"><input className="field" type="number" value={m.amount} onChange={(e) => setM({ ...m, amount: e.target.value })} /></Field><Field label="Monthly installment (₹)"><input className="field" type="number" value={m.installment} onChange={(e) => setM({ ...m, installment: e.target.value })} /></Field></div><Field label="Note"><input className="field" value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} /></Field><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setM(null)}>Cancel</Button><Button loading={act.isPending} disabled={!m.employeeId || !m.amount || !m.installment} onClick={() => act.mutate({ url: "/payroll/advances", body: { ...m, amount: Number(m.amount), installment: Number(m.installment) } }, { onSuccess: () => setM(null) })}>Save</Button></div></div>}</Modal>
    </>
  );
}

function Components() {
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<Comp[]>(["pay-comps"], "/payroll/components");
  const act = useAction([["pay-comps"]]);
  const [m, setM] = useState<Partial<Comp> | null>(null);
  const CALC: Record<string, string> = { fixed: "Fixed ₹/month", percent_basic: "% of basic", percent_gross: "% of gross" };
  return (
    <>
      {can("payroll.process") && <div className="flex justify-end gap-2 mb-4">{!data?.data?.length && <Button variant="secondary" loading={act.isPending} onClick={() => act.mutate({ url: "/payroll/components/seed-defaults" })}>Create Indian defaults (Basic, HRA 40%, Conveyance, Medical, Special, Bonus)</Button>}<Button onClick={() => setM({ name: "", code: "", type: "earning", calc: "fixed", defaultValue: "0", isTaxable: true, isProrated: true, sortOrder: 0, isActive: true })}><Plus size={16} /> Component</Button></div>}
      <p className="text-sm text-muted mb-3">PF, ESI, Professional tax and TDS are computed by the engine from statutory settings — they don't need components here.</p>
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No components yet." /> : <div className="card"><table className="w-full"><thead><tr><th className="th">Component</th><th className="th">Type</th><th className="th">Calculation</th><th className="th">Default</th><th className="th">Prorated on LOP</th><th className="th">Status</th><th className="th"></th></tr></thead>
        <tbody>{data.data.map((c) => <tr key={c.id}><td className="td font-semibold">{c.name} <span className="text-xs font-mono text-muted">{c.code}</span></td><td className="td capitalize">{c.type}</td><td className="td">{CALC[c.calc]}</td><td className="td tabular-nums">{Number(c.defaultValue)}{c.calc !== "fixed" ? "%" : ""}</td><td className="td">{c.isProrated ? "Yes" : "No"}</td><td className="td"><Badge status={c.isActive ? "active" : "inactive"} /></td><td className="td text-right">{can("payroll.process") && <Button size="sm" variant="ghost" onClick={() => setM({ ...c })}>Edit</Button>}</td></tr>)}</tbody></table></div>}
      <Modal open={!!m} onClose={() => setM(null)} title={m?.id ? `Edit ${m.name}` : "New component"}>{m && <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Field label="Name"><input className="field" value={m.name ?? ""} onChange={(e) => setM({ ...m, name: e.target.value })} /></Field><Field label="Code"><input className="field font-mono uppercase" value={m.code ?? ""} onChange={(e) => setM({ ...m, code: e.target.value.toUpperCase() })} disabled={!!m.id} /></Field><Field label="Type"><select className="field" value={m.type} onChange={(e) => setM({ ...m, type: e.target.value as any })}><option value="earning">Earning</option><option value="deduction">Deduction</option></select></Field><Field label="Calculation"><select className="field" value={m.calc} onChange={(e) => setM({ ...m, calc: e.target.value as any })}>{Object.entries(CALC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="Default value"><input className="field" type="number" value={m.defaultValue ?? "0"} onChange={(e) => setM({ ...m, defaultValue: e.target.value })} /></Field><Field label="Sort order"><input className="field" type="number" value={m.sortOrder ?? 0} onChange={(e) => setM({ ...m, sortOrder: Number(e.target.value) })} /></Field></div><div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={!!m.isProrated} onChange={(e) => setM({ ...m, isProrated: e.target.checked })} />Prorate on LOP</label><label className="flex items-center gap-2"><input type="checkbox" checked={!!m.isTaxable} onChange={(e) => setM({ ...m, isTaxable: e.target.checked })} />Taxable</label><label className="flex items-center gap-2"><input type="checkbox" checked={!!m.isActive} onChange={(e) => setM({ ...m, isActive: e.target.checked })} />Active</label></div><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setM(null)}>Cancel</Button><Button loading={act.isPending} disabled={!m.name || !m.code} onClick={() => { const { id, ...body } = m as any; act.mutate({ method: id ? "put" : "post", url: id ? `/payroll/components/${id}` : "/payroll/components", body: { ...body, defaultValue: Number(body.defaultValue) } }, { onSuccess: () => setM(null) }); }}>Save</Button></div></div>}</Modal>
    </>
  );
}

function Settings() {
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<any>(["pay-settings"], "/payroll/settings");
  const act = useAction([["pay-settings"]]);
  const [s, setS] = useState<any>(null);
  if (isLoading) return <Loading />;
  const v = s ?? data?.data; if (!v) return null;
  const set = (path: string, val: any) => { const n = JSON.parse(JSON.stringify(v)); const p = path.split("."); let o = n; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = val; setS(n); };
  const N = (path: string, label: string) => <Field label={label}><input className="field" type="number" step="any" value={path.split(".").reduce((o, k) => o?.[k], v) ?? ""} onChange={(e) => set(path, Number(e.target.value))} disabled={!can("payroll.process")} /></Field>;
  const B = (path: string, label: string) => <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!path.split(".").reduce((o, k) => o?.[k], v)} onChange={(e) => set(path, e.target.checked)} disabled={!can("payroll.process")} />{label}</label>;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card p-4 space-y-3">{B("pf.enabled", "Provident Fund (EPF)")}{N("pf.employeePct", "Employee %")}{N("pf.employerPct", "Employer %")}{N("pf.wageCeiling", "Wage ceiling (₹)")}{B("pf.restrictToCeiling", "Restrict PF to ceiling")}</div>
      <div className="card p-4 space-y-3">{B("esi.enabled", "ESI")}{N("esi.employeePct", "Employee %")}{N("esi.employerPct", "Employer %")}{N("esi.grossCeiling", "Applicable if monthly gross ≤ (₹)")}</div>
      <div className="card p-4 space-y-3">{B("pt.enabled", "Professional tax")}<div className="text-xs text-muted">Monthly gross slabs (state-wise). Last slab: leave "up to" empty.</div>{v.pt.slabs.map((sl: any, i: number) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end"><Field label="Up to ₹"><input className="field" type="number" value={sl.upto ?? ""} placeholder="∞" onChange={(e) => set(`pt.slabs.${i}.upto`, e.target.value === "" ? null : Number(e.target.value))} /></Field><Field label="PT ₹"><input className="field" type="number" value={sl.amount} onChange={(e) => set(`pt.slabs.${i}.amount`, Number(e.target.value))} /></Field><Button size="sm" variant="ghost" className="mb-1" onClick={() => set("pt.slabs", v.pt.slabs.filter((_: any, j: number) => j !== i))}>✕</Button></div>)}<Button size="sm" variant="secondary" onClick={() => set("pt.slabs", [...v.pt.slabs, { upto: null, amount: 0 }])}>Add slab</Button>{B("roundNet", "Round net pay to nearest rupee")}</div>
      {can("payroll.process") && <div className="lg:col-span-3 flex justify-end"><Button loading={act.isPending} onClick={() => act.mutate({ method: "put", url: "/payroll/settings", body: v }, { onSuccess: () => setS(null) })}>Save settings</Button></div>}
    </div>
  );
}
void API_URL;
