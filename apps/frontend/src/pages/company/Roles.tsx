import { useState } from "react";
import { Plus } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PERMISSIONS, DATA_SCOPES, type Permission, type DataScope } from "@hrms/shared-types";

type Role = { id: string; name: string; description: string | null; scope: DataScope; permissions: Permission[] | "*"; isSystem: boolean };
type Draft = { id?: string; name: string; description: string; scope: DataScope; permissions: Permission[] };
const groups = PERMISSIONS.reduce<Record<string, Permission[]>>((a, p) => { const g = p.split(".")[0]; (a[g] ??= []).push(p); return a; }, {});

export default function Roles() {
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<Role[]>(["roles"], "/roles");
  const act = useAction([["roles"]]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const toggle = (p: Permission) => draft && setDraft({ ...draft, permissions: draft.permissions.includes(p) ? draft.permissions.filter((x) => x !== p) : [...draft.permissions, p] });

  return (
    <>
      <PageHeader title="Roles & permissions" sub="Control what each role can see and do, and how far their data access reaches." actions={can("role.create") && <Button onClick={() => setDraft({ name: "", description: "", scope: "own", permissions: [] })}><Plus size={16} /> Custom role</Button>} />
      {isLoading ? <Loading /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data?.data?.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{r.name}</h3><p className="text-xs text-muted">Scope: {r.scope} {r.isSystem && "· system role"}</p></div>
              {can("role.update") && !(r.isSystem && r.name === "Company Admin") && <Button size="sm" variant="ghost" onClick={() => setDraft({ id: r.id, name: r.name, description: r.description ?? "", scope: r.scope, permissions: r.permissions === "*" ? [...PERMISSIONS] : r.permissions })}>Edit</Button>}</div>
            <p className="text-sm mt-2">{r.permissions === "*" ? "Full access to everything in the company." : `${r.permissions.length} permissions`}</p>
            {r.permissions !== "*" && <div className="mt-2 flex flex-wrap gap-1">{r.permissions.slice(0, 8).map((p) => <span key={p} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-mono">{p}</span>)}{r.permissions.length > 8 && <span className="text-[11px] text-muted">+{r.permissions.length - 8}</span>}</div>}
            {can("role.delete") && !r.isSystem && <Button size="sm" variant="link" className="mt-2 text-danger" onClick={() => confirm(`Delete role ${r.name}?`) && act.mutate({ method: "delete", url: `/roles/${r.id}` })}>Delete</Button>}
          </div>
        ))}</div>
      )}
      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? `Edit ${draft.name}` : "New role"} wide>
        {draft && <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Role name"><input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Description"><input className="field" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            <Field label="Data scope"><select className="field" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as DataScope })}>{DATA_SCOPES.map((s) => <option key={s} value={s}>{s === "own" ? "Own data" : s === "team" ? "Reporting employees" : s[0].toUpperCase() + s.slice(1)}</option>)}</select></Field>
          </div>
          <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">{Object.entries(groups).map(([g, ps]) => (
            <div key={g}><div className="text-[12px] font-bold capitalize mb-1.5">{g}</div><div className="flex flex-wrap gap-1.5">{ps.map((p) => (
              <button key={p} type="button" onClick={() => toggle(p)} className={`rounded-md border px-2.5 py-1 text-[12px] font-mono ${draft.permissions.includes(p) ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-ink"}`}>{p.split(".")[1]}</button>
            ))}</div></div>
          ))}</div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button><Button loading={act.isPending} disabled={draft.name.length < 2} onClick={() => act.mutate({ method: draft.id ? "put" : "post", url: draft.id ? `/roles/${draft.id}` : "/roles", body: { name: draft.name, description: draft.description, scope: draft.scope, permissions: draft.permissions } }, { onSuccess: () => setDraft(null) })}>Save role</Button></div>
        </div>}
      </Modal>
    </>
  );
}
