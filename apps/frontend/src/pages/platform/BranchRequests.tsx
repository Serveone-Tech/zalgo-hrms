import { useState } from "react";
import { useGet, useAction } from "@/lib/queries";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { fmtDate, inr } from "@/lib/utils";

type Req = { id: string; companyId: string; name: string; city: string | null; state: string | null; expectedEmployees: number; expectedDevices: number; reason: string | null; branchType: string | null; status: string; defaultPrice: string; approvedPrice: string | null; rejectionReason: string | null; createdAt: string };

export default function BranchRequests() {
  const [status, setStatus] = useState("pending");
  const { data, isLoading } = useGet<Req[]>(["branch-requests", status], `/branches/platform/requests?status=${status}`);
  const act = useAction([["branch-requests"], ["platform-dashboard"]]);
  const [approve, setApprove] = useState<{ r: Req; price: number; note: string } | null>(null);
  const [reject, setReject] = useState<{ r: Req; reason: string } | null>(null);

  return (
    <>
      <PageHeader title="Branch requests" sub="Companies can't activate branches themselves — approve or reject here. Pricing is pre-filled from the plan and can be overridden." />
      <div className="flex gap-1 mb-4">{["pending", "under_review", "approved", "rejected", "all"].map((s) => <button key={s} onClick={() => setStatus(s)} className={`rounded-md px-3 h-8 text-[13px] font-semibold capitalize ${status === s ? "bg-brand text-brand-ink" : "text-muted hover:bg-surface-2"}`}>{s.replace("_", " ")}</button>)}</div>
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text={`No ${status.replace("_", " ")} requests.`} /> : (
        <div className="space-y-3">{data.data.map((r) => (
          <div key={r.id} className="card p-5 grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <div className="flex items-center gap-2"><h3 className="font-bold">{r.name}</h3><Badge status={r.status} /></div>
              <p className="text-sm text-muted mt-0.5">{[r.city, r.state].filter(Boolean).join(", ") || "No location"} · {r.branchType ?? "Branch"} · {fmtDate(r.createdAt)}</p>
              <p className="text-sm mt-2">Expects <b>{r.expectedEmployees}</b> employees and <b>{r.expectedDevices}</b> devices.{r.reason && <> Reason: {r.reason}</>}</p>
              {r.rejectionReason && <p className="text-sm text-danger mt-1">Rejected: {r.rejectionReason}</p>}
              <p className="text-sm mt-2">Default price <b>{inr(r.defaultPrice)}/mo</b>{r.approvedPrice !== null && <> · approved at <b>{inr(r.approvedPrice)}/mo</b></>}</p>
            </div>
            {(r.status === "pending" || r.status === "under_review") && (
              <div className="flex md:flex-col gap-2 justify-end">
                <Button size="sm" onClick={() => setApprove({ r, price: Number(r.defaultPrice), note: "" })}>Approve</Button>
                <Button size="sm" variant="secondary" onClick={() => setReject({ r, reason: "" })}>Reject</Button>
                {r.status === "pending" && <Button size="sm" variant="ghost" onClick={() => act.mutate({ url: `/branches/platform/requests/${r.id}/review` })}>Mark under review</Button>}
              </div>
            )}
          </div>
        ))}</div>
      )}
      <Modal open={!!approve} onClose={() => setApprove(null)} title={`Approve ${approve?.r.name}`}>
        {approve && <div className="space-y-4">
          <Field label="Monthly price for this branch (₹)"><input className="field" type="number" min={0} value={approve.price} onChange={(e) => setApprove({ ...approve, price: Number(e.target.value) })} /></Field>
          <Field label="Note (optional)"><input className="field" value={approve.note} onChange={(e) => setApprove({ ...approve, note: e.target.value })} /></Field>
          <p className="text-xs text-muted">On approval the branch becomes active, the company's branch limit and bill update, and the company is notified.</p>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setApprove(null)}>Cancel</Button><Button loading={act.isPending} onClick={() => act.mutate({ url: `/branches/platform/requests/${approve.r.id}/approve`, body: { approvedPrice: approve.price, note: approve.note } }, { onSuccess: () => setApprove(null) })}>Approve at {inr(approve.price)}/mo</Button></div>
        </div>}
      </Modal>
      <Modal open={!!reject} onClose={() => setReject(null)} title={`Reject ${reject?.r.name}`}>
        {reject && <div className="space-y-4">
          <Field label="Reason (shown to the company)"><textarea className="field" rows={3} value={reject.reason} onChange={(e) => setReject({ ...reject, reason: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="danger" loading={act.isPending} disabled={reject.reason.length < 3} onClick={() => act.mutate({ url: `/branches/platform/requests/${reject.r.id}/reject`, body: { reason: reject.reason } }, { onSuccess: () => setReject(null) })}>Reject request</Button></div>
        </div>}
      </Modal>
    </>
  );
}
