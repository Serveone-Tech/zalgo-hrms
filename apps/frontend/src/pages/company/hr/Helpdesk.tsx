import { useState } from "react";
import { Plus } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn, fmtDate } from "@/lib/utils";

type T = { id: string; number: number; employeeId: string; employeeName: string; category: string; priority: string; subject: string; description: string | null; status: string; assignedTo: string | null; assigneeName: string | null; comments: { byName: string; text: string; at: string; internal?: boolean }[]; createdAt: string };
const tone: Record<string, string> = { open: "pending", in_progress: "under_review", resolved: "approved", closed: "inactive" };
const ptone: Record<string, string> = { low: "inactive", normal: "draft", high: "pending", urgent: "rejected" };

export default function Helpdesk() {
  const { can } = useAuth(); const manage = can("helpdesk.manage");
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [status, setStatus] = useState("open"); const [cat, setCat] = useState("");
  const mine = useGet<T[]>(["tk-me"], "/helpdesk/me"); const all = useGet<T[]>(["tk-all", status, cat], `/helpdesk?status=${status}&category=${cat}`, tab === "all" && manage);
  const agents = useGet<{ id: string; name: string }[]>(["tk-agents"], "/helpdesk/agents", manage);
  const act = useAction([["tk-me"], ["tk-all"], ["tk-one"]]);
  const [sel, setSel] = useState<string | null>(null); const one = useGet<T>(["tk-one", sel], `/helpdesk/${sel}`, !!sel);
  const [open, setOpen] = useState(false); const [f, setF] = useState({ category: "hr", priority: "normal", subject: "", description: "" });
  const [c, setC] = useState(""); const [internal, setInternal] = useState(false);
  const rows = tab === "mine" ? mine.data?.data ?? [] : all.data?.data ?? [];
  const t = one.data?.data;
  return (
    <>
      <PageHeader title="Help desk" sub="Raise tickets to HR, IT, Accounts or Admin." actions={<Button onClick={() => setOpen(true)}><Plus size={16} /> New ticket</Button>} />
      {manage && <div className="flex gap-1 border-b border-line mb-5">{(["mine", "all"] as const).map((k) => <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-2 text-sm font-semibold border-b-2 -mb-px", tab === k ? "border-brand" : "border-transparent text-muted")}>{k === "mine" ? "My tickets" : "All tickets"}</button>)}</div>}
      {tab === "all" && <div className="flex flex-wrap gap-1.5 mb-4">{["", "open", "in_progress", "resolved", "closed"].map((s) => <button key={s} onClick={() => setStatus(s)} className={cn("rounded-md px-2.5 h-8 text-[13px] font-semibold capitalize", status === s ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted")}>{s ? s.replace("_", " ") : "All"}</button>)}<select className="field w-36 h-8 ml-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{["hr", "it", "accounts", "admin"].map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></div>}
      {(tab === "mine" ? mine.isLoading : all.isLoading) ? <Loading /> : !rows.length ? <Empty text="No tickets." /> : <div className="card overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr><th className="th">#</th><th className="th">Subject</th>{tab === "all" && <th className="th">Raised by</th>}<th className="th">Category</th><th className="th">Priority</th><th className="th">Assignee</th><th className="th">Status</th><th className="th">Raised</th></tr></thead>
        <tbody>{rows.map((x) => <tr key={x.id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => setSel(x.id)}><td className="td tabular-nums text-muted">{x.number}</td><td className="td font-semibold">{x.subject}</td>{tab === "all" && <td className="td">{x.employeeName}</td>}<td className="td uppercase text-xs font-semibold">{x.category}</td><td className="td"><Badge status={ptone[x.priority]}>{x.priority}</Badge></td><td className="td text-muted">{x.assigneeName ?? "—"}</td><td className="td"><Badge status={tone[x.status]}>{x.status.replace("_", " ")}</Badge></td><td className="td text-muted">{fmtDate(x.createdAt)}</td></tr>)}</tbody></table></div>}
      <Modal open={open} onClose={() => setOpen(false)} title="New ticket"><div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Field label="Category"><select className="field" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{["hr", "it", "accounts", "admin"].map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></Field><Field label="Priority"><select className="field" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{["low", "normal", "high", "urgent"].map((x) => <option key={x}>{x}</option>)}</select></Field></div><Field label="Subject"><input className="field" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field><Field label="Description"><textarea className="field" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={act.isPending} disabled={f.subject.length < 3} onClick={() => act.mutate({ url: "/helpdesk", body: f }, { onSuccess: () => { setOpen(false); setF({ ...f, subject: "", description: "" }); } })}>Raise ticket</Button></div></div></Modal>
      <Modal open={!!sel} onClose={() => setSel(null)} title={t ? `#${t.number} · ${t.subject}` : "Ticket"} wide>{t && <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm"><Badge status={tone[t.status]}>{t.status.replace("_", " ")}</Badge><Badge status={ptone[t.priority]}>{t.priority}</Badge><span className="uppercase text-xs font-bold">{t.category}</span><span className="text-muted">· {t.employeeName} · {fmtDate(t.createdAt)}{t.assigneeName && ` · assigned to ${t.assigneeName}`}</span></div>
        {t.description && <p className="text-sm whitespace-pre-wrap">{t.description}</p>}
        {manage && <div className="card p-3 flex flex-wrap gap-2 items-end"><Field label="Status"><select className="field h-9" value={t.status} onChange={(e) => act.mutate({ url: `/helpdesk/${t.id}/update`, body: { status: e.target.value } })}>{["open", "in_progress", "resolved", "closed"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select></Field><Field label="Assign to"><select className="field h-9" value={t.assignedTo ?? ""} onChange={(e) => act.mutate({ url: `/helpdesk/${t.id}/update`, body: { assignedTo: e.target.value || null } })}><option value="">Unassigned</option>{agents.data?.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field><Field label="Priority"><select className="field h-9" value={t.priority} onChange={(e) => act.mutate({ url: `/helpdesk/${t.id}/update`, body: { priority: e.target.value } })}>{["low", "normal", "high", "urgent"].map((x) => <option key={x}>{x}</option>)}</select></Field></div>}
        <div className="space-y-2 max-h-64 overflow-y-auto">{t.comments.map((cm, i) => <div key={i} className={cn("rounded-md px-3 py-2 text-sm", cm.internal ? "bg-warn/10" : "bg-surface-2")}><div className="text-xs text-muted mb-0.5">{cm.byName} · {new Date(cm.at).toLocaleString("en-IN")}{cm.internal && " · internal"}</div>{cm.text}</div>)}{!t.comments.length && <p className="text-sm text-muted">No comments yet.</p>}</div>
        {t.status !== "closed" && <div className="space-y-2"><textarea className="field" rows={2} placeholder="Write a reply…" value={c} onChange={(e) => setC(e.target.value)} /><div className="flex items-center justify-between">{manage ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Internal note</label> : <span />}<div className="flex gap-2">{t.status === "resolved" && <Button size="sm" variant="secondary" onClick={() => act.mutate({ url: `/helpdesk/${t.id}/close` })}>Close ticket</Button>}<Button size="sm" loading={act.isPending} disabled={!c.trim()} onClick={() => act.mutate({ url: `/helpdesk/${t.id}/comment`, body: { text: c, internal } }, { onSuccess: () => setC("") })}>Reply</Button></div></div></div>}
      </div>}</Modal>
    </>
  );
}
