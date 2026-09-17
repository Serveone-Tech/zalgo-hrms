import { useState } from "react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { Loading, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fmtDate } from "@/lib/utils";
import type { Balance } from "./types";

type L = { id: string; delta: string; kind: string; note: string | null; createdAt: string; leaveTypeId: string };
export function EmployeeLeave({ employeeId }: { employeeId: string }) {
  const can = useAuth((s) => s.can);
  const year = new Date().getFullYear();
  const { data, isLoading } = useGet<{ balances: Balance[]; ledger: L[] }>(["emp-leave", employeeId, year], `/leaves/balances/${employeeId}?year=${year}`);
  const act = useAction([["emp-leave", employeeId, year]]);
  const [adj, setAdj] = useState<{ leaveTypeId: string; delta: string; note: string } | null>(null);
  const [co, setCo] = useState<{ days: string; workedOn: string; note: string } | null>(null);
  if (isLoading || !data?.data) return <Loading />;
  const { balances, ledger } = data.data; const tname = (id: string) => balances.find((b) => b.type.id === id)?.type.code ?? "";
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div><div className="flex items-center justify-between mb-2"><h3 className="font-bold">Balances {year}</h3>{can("leave.approve") && <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setCo({ days: "1", workedOn: new Date().toISOString().slice(0, 10), note: "" })}>Credit comp-off</Button><Button size="sm" variant="ghost" onClick={() => setAdj({ leaveTypeId: balances[0]?.type.id ?? "", delta: "1", note: "" })}>Adjust</Button></div>}</div>
        <div className="card"><table className="w-full"><thead><tr><th className="th">Type</th><th className="th">Allocated</th><th className="th">Carried</th><th className="th">Adjusted</th><th className="th">Used</th><th className="th">Available</th></tr></thead><tbody>{balances.filter((b) => b.type.kind !== "wfh").map((b) => <tr key={b.id}><td className="td font-semibold">{b.type.name}</td><td className="td tabular-nums">{Number(b.allocated)}</td><td className="td tabular-nums">{Number(b.carriedForward)}</td><td className="td tabular-nums">{Number(b.adjusted)}</td><td className="td tabular-nums">{Number(b.used)}</td><td className="td tabular-nums font-bold">{b.available}</td></tr>)}</tbody></table></div></div>
      <div><h3 className="font-bold mb-2">Ledger</h3><div className="card divide-y divide-line max-h-96 overflow-y-auto">{!ledger.length ? <p className="p-3 text-sm text-muted">No entries.</p> : ledger.map((l) => <div key={l.id} className="px-3 py-2 text-sm flex gap-3"><span className={`font-bold tabular-nums w-12 ${Number(l.delta) < 0 ? "text-danger" : "text-good"}`}>{Number(l.delta) > 0 ? "+" : ""}{Number(l.delta)}</span><span className="flex-1"><span className="font-mono text-xs">{tname(l.leaveTypeId)}</span> <span className="capitalize">{l.kind.replace("_", " ")}</span>{l.note && <span className="text-muted"> — {l.note}</span>}</span><span className="text-xs text-muted whitespace-nowrap">{fmtDate(l.createdAt)}</span></div>)}</div></div>
      <Modal open={!!adj} onClose={() => setAdj(null)} title="Adjust balance">{adj && <div className="space-y-4"><Field label="Leave type"><select className="field" value={adj.leaveTypeId} onChange={(e) => setAdj({ ...adj, leaveTypeId: e.target.value })}>{balances.map((b) => <option key={b.type.id} value={b.type.id}>{b.type.name}</option>)}</select></Field><Field label="Days (+ credit / − debit)"><input className="field" type="number" step="0.5" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value })} /></Field><Field label="Note"><input className="field" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAdj(null)}>Cancel</Button><Button loading={act.isPending} disabled={adj.note.length < 2} onClick={() => act.mutate({ url: "/leaves/balances/adjust", body: { employeeId, leaveTypeId: adj.leaveTypeId, year, delta: Number(adj.delta), note: adj.note } }, { onSuccess: () => setAdj(null) })}>Apply</Button></div></div>}</Modal>
      <Modal open={!!co} onClose={() => setCo(null)} title="Credit compensatory off">{co && <div className="space-y-4"><Field label="Worked on (holiday / week-off)"><input className="field" type="date" value={co.workedOn} onChange={(e) => setCo({ ...co, workedOn: e.target.value })} /></Field><Field label="Days"><input className="field" type="number" step="0.5" value={co.days} onChange={(e) => setCo({ ...co, days: e.target.value })} /></Field><Field label="Note"><input className="field" value={co.note} onChange={(e) => setCo({ ...co, note: e.target.value })} /></Field><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCo(null)}>Cancel</Button><Button loading={act.isPending} onClick={() => act.mutate({ url: "/leaves/balances/comp-off", body: { employeeId, days: Number(co.days), workedOn: co.workedOn, note: co.note } }, { onSuccess: () => setCo(null) })}>Credit</Button></div></div>}</Modal>
    </div>
  );
}
