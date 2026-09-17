import { useState } from "react";
import { Link } from "react-router-dom";
import { useAction } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Empty } from "@/components/ui/page";
import { fmtDate } from "@/lib/utils";
import { LSTATUS, ltone, type LeaveReq } from "./types";

export function RequestList({ rows, mode, showEmployee }: { rows: LeaveReq[]; mode: "mine" | "approve" | "all"; showEmployee?: boolean }) {
  const act = useAction([["leave-req-me"], ["leave-pending"], ["leave-all"], ["leave-bal-me"], ["company-dashboard"], ["attendance-daily"]]);
  const [rej, setRej] = useState<{ id: string; reason: string } | null>(null);
  if (!rows.length) return <Empty text={mode === "approve" ? "Nothing waiting for your approval." : "No leave requests."} />;
  return (
    <>
      <div className="space-y-2">{rows.map((r) => (
        <div key={r.id} className="card px-4 py-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-2">{showEmployee && <Link to={`/app/employees/${r.employeeId}`} className="font-semibold hover:text-brand">{r.employeeName}</Link>}<span className={showEmployee ? "text-sm" : "font-semibold"}>{r.typeName}</span><Badge status={ltone[r.status]}>{LSTATUS[r.status]}</Badge>{!r.isPaid && <Badge status="draft">unpaid</Badge>}</div>
            <div className="text-sm text-muted mt-0.5">{fmtDate(r.fromDate)}{r.toDate !== r.fromDate && ` – ${fmtDate(r.toDate)}`} · <b className="text-ink">{Number(r.days)}</b> day{Number(r.days) === 1 ? "" : "s"}{r.halfDay && ` (${r.halfDay.replace("_", " ")})`}{showEmployee && r.departmentName ? ` · ${r.departmentName}` : ""} · applied {fmtDate(r.createdAt)}</div>
            {r.reason && <p className="text-sm mt-1">{r.reason}</p>}
            {r.approvals.map((a, i) => <p key={i} className="text-xs text-muted mt-0.5">L{a.level} {a.action} by {a.byName}{a.note ? ` — ${a.note}` : ""}</p>)}
            {r.rejectionReason && <p className="text-sm text-danger mt-1">Rejected: {r.rejectionReason}</p>}
          </div>
          <div className="flex md:flex-col gap-1.5 justify-end">
            {mode === "approve" && ["pending", "manager_approved"].includes(r.status) && <><Button size="sm" loading={act.isPending} onClick={() => act.mutate({ url: `/leaves/requests/${r.id}/approve` })}>Approve</Button><Button size="sm" variant="secondary" onClick={() => setRej({ id: r.id, reason: "" })}>Reject</Button></>}
            {(mode === "mine" || mode === "all") && ["pending", "manager_approved", "approved"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => confirm("Cancel this leave?") && act.mutate({ url: `/leaves/requests/${r.id}/cancel` })}>Cancel</Button>}
          </div>
        </div>))}</div>
      <Modal open={!!rej} onClose={() => setRej(null)} title="Reject leave">{rej && <div className="space-y-4"><Field label="Reason (shown to employee)"><textarea className="field" rows={3} value={rej.reason} onChange={(e) => setRej({ ...rej, reason: e.target.value })} /></Field><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRej(null)}>Back</Button><Button variant="danger" loading={act.isPending} disabled={rej.reason.length < 2} onClick={() => act.mutate({ url: `/leaves/requests/${rej.id}/reject`, body: { reason: rej.reason } }, { onSuccess: () => setRej(null) })}>Reject</Button></div></div>}</Modal>
    </>
  );
}
