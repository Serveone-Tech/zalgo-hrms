import { useState } from "react";
import { Plus } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn, inr, fmtDate } from "@/lib/utils";

type Cat = { id: string; name: string; maxAmount: string | null; requiresReceipt: boolean; isActive: boolean };
type Exp = { id: string; employeeId: string; employeeName: string; employeeCode: string; departmentName: string | null; categoryName: string | null; title: string; description: string | null; amount: string; expenseDate: string; receiptUrl: string | null; status: string; approvals: { level: number; byName: string; action: string; note?: string }[]; rejectionReason: string | null; paidAt: string | null; paidRef: string | null; createdAt: string };
const ST: Record<string, [string, string]> = { pending: ["Pending", "pending"], manager_approved: ["Manager approved", "under_review"], approved: ["Approved", "trial"], rejected: ["Rejected", "rejected"], paid: ["Paid", "approved"] };

export default function Expenses() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"mine" | "approvals" | "all" | "categories">("mine");
  const [open, setOpen] = useState(false);
  const cats = useGet<Cat[]>(["exp-cats"], "/expenses/categories");
  const mine = useGet<Exp[]>(["exp-me"], "/expenses/me"); const pending = useGet<Exp[]>(["exp-pending"], "/expenses/pending");
  const [status, setStatus] = useState(""); const all = useGet<Exp[]>(["exp-all", status], `/expenses?status=${status}`, tab === "all" && can("expense.view"));
  const act = useAction([["exp-me"], ["exp-pending"], ["exp-all"], ["exp-cats"], ["company-dashboard"]]);
  const [f, setF] = useState({ categoryId: "", title: "", description: "", amount: "", expenseDate: new Date().toISOString().slice(0, 10), receiptUrl: "" });
  const [rej, setRej] = useState<{ id: string; reason: string } | null>(null);
  const tabs = [{ k: "mine", l: "My expenses", show: true }, { k: "approvals", l: "Approvals", n: pending.data?.data?.length, show: true }, { k: "all", l: "All", show: can("expense.view") }, { k: "categories", l: "Categories", show: can("expense.approve") }] as const;
  const List = ({ rows, mode }: { rows: Exp[]; mode: "mine" | "approve" | "all" }) => !rows.length ? <Empty text={mode === "approve" ? "Nothing to approve." : "No expenses."} /> : <div className="space-y-2">{rows.map((x) => (
    <div key={x.id} className="card px-4 py-3 grid gap-3 md:grid-cols-[1fr_auto]"><div>
      <div className="flex flex-wrap items-center gap-2">{mode !== "mine" && <span className="font-semibold">{x.employeeName}</span>}<span className={mode === "mine" ? "font-semibold" : ""}>{x.title}</span><Badge status={ST[x.status][1]}>{ST[x.status][0]}</Badge></div>
      <div className="text-sm text-muted mt-0.5"><b className="text-ink">{inr(x.amount)}</b> · {x.categoryName ?? "Uncategorised"} · {fmtDate(x.expenseDate)}{x.receiptUrl && <> · <a className="text-brand" href={x.receiptUrl} target="_blank" rel="noreferrer">receipt</a></>}{x.paidRef && ` · ref ${x.paidRef}`}</div>
      {x.description && <p className="text-sm mt-1">{x.description}</p>}{x.approvals.map((a, i) => <p key={i} className="text-xs text-muted">L{a.level} {a.action} by {a.byName}{a.note ? ` — ${a.note}` : ""}</p>)}{x.rejectionReason && <p className="text-sm text-danger">Rejected: {x.rejectionReason}</p>}
    </div><div className="flex md:flex-col gap-1.5 justify-end">
      {mode === "approve" && ["pending", "manager_approved"].includes(x.status) && <><Button size="sm" loading={act.isPending} onClick={() => act.mutate({ url: `/expenses/${x.id}/approve` })}>Approve</Button><Button size="sm" variant="secondary" onClick={() => setRej({ id: x.id, reason: "" })}>Reject</Button></>}
      {mode === "approve" && x.status === "approved" && can("expense.pay") && <Button size="sm" onClick={() => { const ref = prompt("Payment reference (optional)") ?? ""; act.mutate({ url: `/expenses/${x.id}/pay`, body: { paidRef: ref } }); }}>Mark paid</Button>}
      {mode === "mine" && x.status === "pending" && <Button size="sm" variant="ghost" onClick={() => act.mutate({ method: "delete", url: `/expenses/${x.id}` })}>Withdraw</Button>}
    </div></div>))}</div>;
  return (
    <>
      <PageHeader title="Expenses" sub="Claims, approvals and reimbursements." actions={can("expense.submit") && <Button onClick={() => setOpen(true)}><Plus size={16} /> New claim</Button>} />
      <div className="flex gap-1 border-b border-line mb-5">{tabs.filter((t) => t.show).map((t) => <button key={t.k} onClick={() => setTab(t.k)} className={cn("px-3 py-2 text-sm font-semibold border-b-2 -mb-px", tab === t.k ? "border-brand" : "border-transparent text-muted")}>{t.l}{"n" in t && t.n ? <span className="ml-1.5 rounded-full bg-warn/15 text-warn px-1.5 text-[11px]">{t.n}</span> : null}</button>)}</div>
      {tab === "mine" && (mine.isLoading ? <Loading /> : <List rows={mine.data?.data ?? []} mode="mine" />)}
      {tab === "approvals" && (pending.isLoading ? <Loading /> : <List rows={pending.data?.data ?? []} mode="approve" />)}
      {tab === "all" && <><div className="flex gap-1.5 mb-4">{["", "pending", "manager_approved", "approved", "paid", "rejected"].map((s) => <button key={s} onClick={() => setStatus(s)} className={cn("rounded-md px-2.5 h-8 text-[13px] font-semibold", status === s ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted")}>{s ? ST[s][0] : "All"}</button>)}</div>{all.isLoading ? <Loading /> : <List rows={all.data?.data ?? []} mode="all" />}</>}
      {tab === "categories" && <><div className="flex justify-end gap-2 mb-3">{!cats.data?.data?.length && <Button size="sm" variant="secondary" onClick={() => act.mutate({ url: "/expenses/categories/seed-defaults" })}>Create defaults</Button>}<Button size="sm" onClick={() => { const name = prompt("Category name"); if (name) act.mutate({ url: "/expenses/categories", body: { name } }); }}><Plus size={14} /> Category</Button></div>
        {!cats.data?.data?.length ? <Empty text="No categories." /> : <div className="card"><table className="w-full"><thead><tr><th className="th">Category</th><th className="th">Cap</th><th className="th">Receipt</th><th className="th">Status</th></tr></thead><tbody>{cats.data.data.map((c) => <tr key={c.id}><td className="td font-semibold">{c.name}</td><td className="td">{c.maxAmount ? inr(c.maxAmount) : "—"}</td><td className="td"><input type="checkbox" checked={c.requiresReceipt} onChange={(e) => act.mutate({ method: "put", url: `/expenses/categories/${c.id}`, body: { requiresReceipt: e.target.checked } })} /></td><td className="td"><Badge status={c.isActive ? "active" : "inactive"} /></td></tr>)}</tbody></table></div>}</>}
      <Modal open={open} onClose={() => setOpen(false)} title="New expense claim"><div className="space-y-4">
        <Field label="Category"><select className="field" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">—</option>{cats.data?.data?.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}{c.maxAmount ? ` (max ${inr(c.maxAmount)})` : ""}</option>)}</select></Field>
        <Field label="Title"><input className="field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Client visit — Bhopal" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Amount (₹)"><input className="field" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field><Field label="Date"><input className="field" type="date" value={f.expenseDate} onChange={(e) => setF({ ...f, expenseDate: e.target.value })} /></Field></div>
        <Field label="Receipt link (Drive / photo URL)"><input className="field" value={f.receiptUrl} onChange={(e) => setF({ ...f, receiptUrl: e.target.value })} placeholder="https://…" /></Field>
        <Field label="Description"><textarea className="field" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={act.isPending} disabled={!f.title || !f.amount} onClick={() => act.mutate({ url: "/expenses", body: { ...f, categoryId: f.categoryId || null, amount: Number(f.amount), receiptUrl: f.receiptUrl || null } }, { onSuccess: () => { setOpen(false); setF({ ...f, title: "", amount: "", description: "", receiptUrl: "" }); } })}>Submit</Button></div>
      </div></Modal>
      <Modal open={!!rej} onClose={() => setRej(null)} title="Reject expense">{rej && <div className="space-y-4"><Field label="Reason"><textarea className="field" rows={3} value={rej.reason} onChange={(e) => setRej({ ...rej, reason: e.target.value })} /></Field><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRej(null)}>Back</Button><Button variant="danger" loading={act.isPending} disabled={rej.reason.length < 2} onClick={() => act.mutate({ url: `/expenses/${rej.id}/reject`, body: { reason: rej.reason } }, { onSuccess: () => setRej(null) })}>Reject</Button></div></div>}</Modal>
    </>
  );
}
