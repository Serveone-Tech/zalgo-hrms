import { useEffect, useState } from "react";
import { useGet, useAction } from "@/lib/queries";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Loading, Field, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fmtDate, inr } from "@/lib/utils";
import { PayBreakdown } from "./PayBreakdown";
import type { Comp, Pay, Salary } from "./types";

export function SalaryTab({ employeeId }: { employeeId: string }) {
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<{ current: Salary | null; history: Salary[]; preview: Pay | null }>(["salary", employeeId], `/payroll/employees/${employeeId}/salary`);
  const comps = useGet<Comp[]>(["pay-comps"], "/payroll/components");
  const act = useAction([["salary", employeeId]]);
  const [m, setM] = useState<{ effectiveFrom: string; ctcMonthly: string; values: Record<string, string>; pfOptIn: boolean; esiOptIn: boolean; ptApplicable: boolean; tdsMonthly: string; paymentMode: string; note: string } | null>(null);
  const [preview, setPreview] = useState<Pay | null>(null);
  const activeComps = comps.data?.data?.filter((c) => c.isActive && !c.isStatutory) ?? [];
  const toComponents = (values: Record<string, string>) => activeComps.filter((c) => values[c.id] !== undefined && values[c.id] !== "").map((c) => ({ componentId: c.id, code: c.code, value: Number(values[c.id]) }));
  useEffect(() => { if (!m) return; const t = setTimeout(async () => { try { const { data: r } = await api.post("/payroll/preview", { components: toComponents(m.values), pfOptIn: m.pfOptIn, esiOptIn: m.esiOptIn, ptApplicable: m.ptApplicable, tdsMonthly: Number(m.tdsMonthly) }); setPreview(r.data); } catch {} }, 400); return () => clearTimeout(t); }, [m]);
  if (isLoading) return <Loading />;
  const cur = data?.data?.current;
  const open = () => { const values: Record<string, string> = {}; for (const c of activeComps) values[c.id] = String(cur?.components.find((x) => x.componentId === c.id)?.value ?? c.defaultValue); setM({ effectiveFrom: new Date().toISOString().slice(0, 10), ctcMonthly: cur?.ctcMonthly ?? "0", values, pfOptIn: cur?.pfOptIn ?? true, esiOptIn: cur?.esiOptIn ?? true, ptApplicable: cur?.ptApplicable ?? true, tdsMonthly: cur?.tdsMonthly ?? "0", paymentMode: cur?.paymentMode ?? "bank", note: "" }); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h3 className="font-bold">Salary structure {cur && <span className="text-sm font-normal text-muted">effective {fmtDate(cur.effectiveFrom)}</span>}</h3>{can("payroll.process") && <Button size="sm" onClick={open} disabled={!activeComps.length}>{cur ? "Revise salary" : "Set salary"}</Button>}</div>
      {!activeComps.length && <p className="text-sm text-warn">No salary components yet — go to Payroll → Components and create defaults.</p>}
      {!cur ? <Empty text="No salary structure. Payroll will skip this employee." /> : data?.data?.preview && <div className="card p-4"><PayBreakdown p={data.data.preview} /><p className="text-xs text-muted mt-2">Monthly preview at full attendance · PF {cur.pfOptIn ? "on" : "off"} · ESI {cur.esiOptIn ? "on" : "off"} · PT {cur.ptApplicable ? "on" : "off"} · TDS {inr(cur.tdsMonthly)}/mo · paid by {cur.paymentMode}</p></div>}
      {(data?.data?.history.length ?? 0) > 1 && <div className="card divide-y divide-line">{data!.data!.history.map((h) => <div key={h.id} className="px-4 py-2 text-sm flex justify-between"><span>From {fmtDate(h.effectiveFrom)}{h.note && <span className="text-muted"> — {h.note}</span>}</span><span className="tabular-nums">Basic {inr(h.components.find((c) => c.code === "BASIC")?.value ?? 0)}</span></div>)}</div>}
      <Modal open={!!m} onClose={() => setM(null)} title={cur ? "Revise salary" : "Set salary structure"} wide>{m && <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><Field label="Effective from"><input className="field" type="date" value={m.effectiveFrom} onChange={(e) => setM({ ...m, effectiveFrom: e.target.value })} /></Field><Field label="Payment mode"><select className="field" value={m.paymentMode} onChange={(e) => setM({ ...m, paymentMode: e.target.value })}><option value="bank">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></Field></div>
          {activeComps.map((c) => <Field key={c.id} label={`${c.name} (${c.code})${c.calc === "percent_basic" ? " — % of basic" : c.calc === "percent_gross" ? " — % of gross" : " — ₹/month"}${c.type === "deduction" ? " · deduction" : ""}`}><input className="field" type="number" value={m.values[c.id] ?? ""} onChange={(e) => setM({ ...m, values: { ...m.values, [c.id]: e.target.value } })} /></Field>)}
          <Field label="TDS per month (₹)"><input className="field" type="number" value={m.tdsMonthly} onChange={(e) => setM({ ...m, tdsMonthly: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={m.pfOptIn} onChange={(e) => setM({ ...m, pfOptIn: e.target.checked })} />PF</label><label className="flex items-center gap-2"><input type="checkbox" checked={m.esiOptIn} onChange={(e) => setM({ ...m, esiOptIn: e.target.checked })} />ESI</label><label className="flex items-center gap-2"><input type="checkbox" checked={m.ptApplicable} onChange={(e) => setM({ ...m, ptApplicable: e.target.checked })} />Professional tax</label></div>
          <Field label="Note"><input className="field" value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} placeholder="Annual increment" /></Field>
        </div>
        <div><div className="text-sm font-bold mb-2">Live preview (full month)</div>{preview ? <PayBreakdown p={preview} compact /> : <p className="text-sm text-muted">Enter amounts…</p>}
          <div className="flex justify-end gap-2 mt-4"><Button variant="secondary" onClick={() => setM(null)}>Cancel</Button><Button loading={act.isPending} disabled={!toComponents(m.values).some((c) => c.code === "BASIC" && c.value > 0)} onClick={() => act.mutate({ method: "put", url: `/payroll/employees/${employeeId}/salary`, body: { effectiveFrom: m.effectiveFrom, ctcMonthly: preview?.employerCost ?? 0, components: toComponents(m.values), pfOptIn: m.pfOptIn, esiOptIn: m.esiOptIn, ptApplicable: m.ptApplicable, tdsMonthly: Number(m.tdsMonthly), paymentMode: m.paymentMode, note: m.note } }, { onSuccess: () => setM(null) })}>Save structure</Button></div></div>
      </div>}</Modal>
    </div>
  );
}
