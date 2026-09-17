import { useEffect, useState } from "react";
import { useGet, useAction } from "@/lib/queries";
import { Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import type { LeaveType, Balance } from "./types";

export function ApplyLeave({ onDone, employeeId }: { onDone: () => void; employeeId?: string }) {
  const types = useGet<LeaveType[]>(["leave-types"], "/leaves/types");
  const bal = useGet<{ balances: Balance[] } | null>(["leave-bal-me"], "/leaves/balances/me", !employeeId);
  const act = useAction([["leave-req-me"], ["leave-pending"], ["leave-all"], ["leave-bal-me"], ["company-dashboard"]]);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ leaveTypeId: "", fromDate: today, toDate: today, halfDay: "", reason: "", contactDuringLeave: "" });
  const t = types.data?.data?.find((x) => x.id === f.leaveTypeId);
  const b = bal.data?.data?.balances.find((x) => x.type.id === f.leaveTypeId);
  const wd = useGet<{ days: number }>(["wd", f.fromDate, f.toDate, f.halfDay, employeeId], `/leaves/working-days?from=${f.fromDate}&to=${f.toDate}&halfDay=${f.halfDay}${employeeId ? `&employeeId=${employeeId}` : ""}`, !!f.fromDate && !!f.toDate && f.toDate >= f.fromDate);
  useEffect(() => { if (f.halfDay) setF((x) => ({ ...x, toDate: x.fromDate })); }, [f.halfDay, f.fromDate]);
  const days = wd.data?.data?.days ?? 0;
  return (
    <div className="space-y-4">
      <Field label="Leave type"><select className="field" value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value, halfDay: "" })}><option value="">Select…</option>{types.data?.data?.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.code}){!employeeId && x.kind === "leave" ? ` — ${bal.data?.data?.balances.find((y) => y.type.id === x.id)?.available ?? 0} left` : ""}</option>)}</select></Field>
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="From"><input className="field" type="date" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value, toDate: e.target.value > f.toDate ? e.target.value : f.toDate })} /></Field>
        <Field label="To"><input className="field" type="date" value={f.toDate} min={f.fromDate} disabled={!!f.halfDay} onChange={(e) => setF({ ...f, toDate: e.target.value })} /></Field>
        <Field label="Half day"><select className="field" value={f.halfDay} disabled={t ? !t.allowHalfDay : false} onChange={(e) => setF({ ...f, halfDay: e.target.value })}><option value="">Full day</option><option value="first_half">First half</option><option value="second_half">Second half</option></select></Field>
      </div>
      <div className="rounded-md bg-surface-2 px-3 py-2 text-sm flex justify-between"><span>Working days (excl. holidays & week-offs)</span><b>{days}</b></div>
      {t && b && t.kind === "leave" && !t.allowNegative && days > b.available && <p className="text-sm text-danger">Only {b.available} {t.code} available.</p>}
      {t && t.minNoticeDays > 0 && <p className="text-xs text-muted">{t.name} needs {t.minNoticeDays} day(s) notice · {t.approvalLevels === 2 ? "Manager + HR approval" : "Manager approval"}</p>}
      <Field label="Reason"><textarea className="field" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <Field label="Contact during leave (optional)"><input className="field" value={f.contactDuringLeave} onChange={(e) => setF({ ...f, contactDuringLeave: e.target.value })} /></Field>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onDone}>Cancel</Button><Button loading={act.isPending} disabled={!f.leaveTypeId || days <= 0} onClick={() => act.mutate({ url: "/leaves/requests", body: { ...f, halfDay: f.halfDay || null, employeeId } }, { onSuccess: onDone })}>Submit request</Button></div>
    </div>
  );
}
