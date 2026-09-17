import { useState } from "react";
import { Plus, Pin } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn, fmtDate } from "@/lib/utils";
import type { Branch, Dept } from "../employees/types";

type A = { id: string; title: string; body: string; targetType: string; targetIds: string[]; priority: string; eventDate: string | null; publishAt: string; expiresAt: string | null; isPinned: boolean; createdByName: string | null };
const ptone: Record<string, string> = { info: "trial", success: "approved", warning: "pending", critical: "rejected" };
export default function Announcements() {
  const { can } = useAuth(); const manage = can("announcement.manage");
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading } = useGet<A[]>(["ann", showAll], showAll ? "/announcements/all" : "/announcements");
  const branches = useGet<Branch[]>(["branches"], "/branches", manage); const depts = useGet<Dept[]>(["departments"], "/departments", manage); const emps = useGet<{ id: string; name: string }[]>(["managers"], "/employees/managers", manage);
  const act = useAction([["ann"]]);
  const [m, setM] = useState<Partial<A> | null>(null);
  const targets = m?.targetType === "branch" ? branches.data?.data : m?.targetType === "department" ? depts.data?.data : m?.targetType === "employees" ? emps.data?.data : null;
  return (
    <>
      <PageHeader title="Announcements" sub="Company news, policies and events." actions={manage && <><Button variant="secondary" size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? "Show live feed" : "Manage all"}</Button><Button onClick={() => setM({ title: "", body: "", targetType: "company", targetIds: [], priority: "info", isPinned: false })}><Plus size={16} /> Announce</Button></>} />
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No announcements yet." /> : <div className="space-y-3">{data.data.map((a) => (
        <article key={a.id} className={cn("card p-5", a.priority === "critical" && "border-danger/50", a.priority === "warning" && "border-warn/50")}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex items-center gap-2">{a.isPinned && <Pin size={14} className="text-brand" />}<h3 className="font-bold text-lg">{a.title}</h3><Badge status={ptone[a.priority]}>{a.priority}</Badge></div>{manage && <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setM({ ...a })}>Edit</Button><Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm("Delete?") && act.mutate({ method: "delete", url: `/announcements/${a.id}` })}>Delete</Button></div>}</div>
          <p className="text-sm whitespace-pre-wrap mt-2">{a.body}</p>
          <div className="text-xs text-muted mt-3">{a.createdByName} · {fmtDate(a.publishAt)}{a.eventDate && ` · event on ${fmtDate(a.eventDate)}`}{a.expiresAt && ` · until ${fmtDate(a.expiresAt)}`} · {a.targetType === "company" ? "everyone" : `${a.targetType}: ${a.targetIds.length}`}</div>
        </article>))}</div>}
      <Modal open={!!m} onClose={() => setM(null)} title={m?.id ? "Edit announcement" : "New announcement"} wide>{m && <div className="space-y-4">
        <Field label="Title"><input className="field" value={m.title ?? ""} onChange={(e) => setM({ ...m, title: e.target.value })} /></Field>
        <Field label="Message"><textarea className="field" rows={5} value={m.body ?? ""} onChange={(e) => setM({ ...m, body: e.target.value })} /></Field>
        <div className="grid sm:grid-cols-3 gap-3"><Field label="Audience"><select className="field" value={m.targetType} onChange={(e) => setM({ ...m, targetType: e.target.value, targetIds: [] })}><option value="company">Entire company</option><option value="branch">Specific branches</option><option value="department">Specific departments</option><option value="employees">Specific employees</option></select></Field><Field label="Priority"><select className="field" value={m.priority} onChange={(e) => setM({ ...m, priority: e.target.value })}>{["info", "success", "warning", "critical"].map((p) => <option key={p}>{p}</option>)}</select></Field><Field label="Event date (shows on calendar)"><input className="field" type="date" value={m.eventDate ?? ""} onChange={(e) => setM({ ...m, eventDate: e.target.value || null })} /></Field></div>
        {targets && <Field label="Select"><select multiple className="field h-32" value={m.targetIds} onChange={(e) => setM({ ...m, targetIds: [...e.target.selectedOptions].map((o) => o.value) })}>{targets.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
        <div className="grid sm:grid-cols-2 gap-3"><Field label="Expires (optional)"><input className="field" type="date" value={m.expiresAt?.slice(0, 10) ?? ""} onChange={(e) => setM({ ...m, expiresAt: e.target.value || null })} /></Field><label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={!!m.isPinned} onChange={(e) => setM({ ...m, isPinned: e.target.checked })} />Pin to top</label></div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setM(null)}>Cancel</Button><Button loading={act.isPending} disabled={!m.title || !m.body} onClick={() => { const { id, createdByName, publishAt, ...body } = m as any; act.mutate({ method: id ? "put" : "post", url: id ? `/announcements/${id}` : "/announcements", body: { ...body, expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null } }, { onSuccess: () => setM(null) }); }}>{m.id ? "Save" : "Publish"}</Button></div>
      </div>}</Modal>
    </>
  );
}
