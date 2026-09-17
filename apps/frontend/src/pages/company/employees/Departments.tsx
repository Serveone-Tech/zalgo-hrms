import { useState } from "react";
import { Plus } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import type { Dept, Desig, Branch } from "./types";

export function Departments() {
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<Dept[]>(["departments"], "/departments"); const branches = useGet<Branch[]>(["branches"], "/branches");
  const act = useAction([["departments"]]);
  const [m, setM] = useState<{ id?: string; name: string; code: string; branchId: string } | null>(null);
  return (
    <>
      <PageHeader title="Departments" sub="Company-wide or branch-specific." actions={can("department.manage") && <Button onClick={() => setM({ name: "", code: "", branchId: "" })}><Plus size={16} /> Department</Button>} />
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No departments yet." /> : <div className="card"><table className="w-full"><thead><tr><th className="th">Department</th><th className="th">Scope</th><th className="th">Employees</th><th className="th"></th></tr></thead>
        <tbody>{data.data.map((d) => <tr key={d.id}><td className="td font-semibold">{d.name}{d.code && <span className="ml-2 text-xs text-muted font-normal">{d.code}</span>}</td><td className="td text-muted">{d.branchId ? branches.data?.data?.find((b) => b.id === d.branchId)?.name : "Company-wide"}</td><td className="td tabular-nums">{d.employeeCount}</td>
          <td className="td text-right whitespace-nowrap">{can("department.manage") && <><Button size="sm" variant="ghost" onClick={() => setM({ id: d.id, name: d.name, code: d.code ?? "", branchId: d.branchId ?? "" })}>Edit</Button><Button size="sm" variant="ghost" className="text-danger" disabled={d.employeeCount > 0} onClick={() => confirm(`Delete ${d.name}?`) && act.mutate({ method: "delete", url: `/departments/${d.id}` })}>Delete</Button></>}</td></tr>)}</tbody></table></div>}
      <Modal open={!!m} onClose={() => setM(null)} title={m?.id ? "Edit department" : "New department"}>{m && <div className="space-y-4">
        <Field label="Name"><input className="field" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></Field>
        <Field label="Code"><input className="field" value={m.code} onChange={(e) => setM({ ...m, code: e.target.value })} /></Field>
        <Field label="Branch"><select className="field" value={m.branchId} onChange={(e) => setM({ ...m, branchId: e.target.value })}><option value="">Company-wide</option>{branches.data?.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setM(null)}>Cancel</Button><Button loading={act.isPending} disabled={m.name.length < 2} onClick={() => act.mutate({ method: m.id ? "put" : "post", url: m.id ? `/departments/${m.id}` : "/departments", body: { name: m.name, code: m.code || undefined, branchId: m.branchId || null } }, { onSuccess: () => setM(null) })}>Save</Button></div>
      </div>}</Modal>
    </>
  );
}

export function Designations() {
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<Desig[]>(["designations"], "/designations");
  const act = useAction([["designations"]]);
  const [m, setM] = useState<{ id?: string; name: string; level: number } | null>(null);
  return (
    <>
      <PageHeader title="Designations" sub="Job titles with a seniority level (1 = most junior)." actions={can("designation.manage") && <Button onClick={() => setM({ name: "", level: 1 })}><Plus size={16} /> Designation</Button>} />
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No designations yet." /> : <div className="card"><table className="w-full"><thead><tr><th className="th">Designation</th><th className="th">Level</th><th className="th">Status</th><th className="th"></th></tr></thead>
        <tbody>{data.data.map((d) => <tr key={d.id}><td className="td font-semibold">{d.name}</td><td className="td tabular-nums">{d.level}</td><td className="td"><Badge status={d.isActive ? "active" : "inactive"} /></td>
          <td className="td text-right whitespace-nowrap">{can("designation.manage") && <><Button size="sm" variant="ghost" onClick={() => setM({ id: d.id, name: d.name, level: d.level })}>Edit</Button><Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm(`Delete ${d.name}?`) && act.mutate({ method: "delete", url: `/designations/${d.id}` })}>Delete</Button></>}</td></tr>)}</tbody></table></div>}
      <Modal open={!!m} onClose={() => setM(null)} title={m?.id ? "Edit designation" : "New designation"}>{m && <div className="space-y-4">
        <Field label="Name"><input className="field" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></Field>
        <Field label="Level"><input className="field" type="number" min={1} max={50} value={m.level} onChange={(e) => setM({ ...m, level: Number(e.target.value) })} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setM(null)}>Cancel</Button><Button loading={act.isPending} disabled={m.name.length < 2} onClick={() => act.mutate({ method: m.id ? "put" : "post", url: m.id ? `/designations/${m.id}` : "/designations", body: { name: m.name, level: m.level } }, { onSuccess: () => setM(null) })}>Save</Button></div>
      </div>}</Modal>
    </>
  );
}
