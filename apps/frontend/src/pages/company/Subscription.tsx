import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGet } from "@/lib/queries";
import { PageHeader, Loading, Stat } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, errMsg } from "@/lib/api";
import { payWithRazorpay, type RazorpayOrder } from "@/lib/razorpay";
import { fmtDate, inr, daysLeft } from "@/lib/utils";
import { MODULES, type ModuleKey } from "@hrms/shared-types";
import { InvoiceTable, type Invoice } from "@/components/InvoiceTable";
import type { ApiResponse } from "@hrms/shared-types";

type S = { status: string; billingCycle: string; employeeLimit: number; branchLimit: number; deviceLimit: number; modules: string[]; basePrice: string; additionalBranchTotal: string; additionalEmployeeTotal: string; additionalDeviceTotal: string; addonsTotal: string; total: number; startsAt: string; endsAt: string; plan: { id: string; name: string; description: string | null } | null; history: { id: string; action: string; note: string | null; createdAt: string }[] };
type Plan = { id: string; name: string; monthlyPrice: string; includedEmployees: number; includedBranches: number; modules: string[] };
type Payment = { id: string; purpose: string; amount: string; status: string; createdAt: string; razorpayPaymentId: string | null };

export default function Subscription() {
  const { data, isLoading } = useGet<S>(["my-subscription"], "/subscriptions/me");
  const plans = useGet<Plan[]>(["public-plans"], "/subscriptions/plans");
  const invoices = useGet<Invoice[]>(["my-invoices"], "/invoices/me");
  const payments = useGet<Payment[]>(["my-payments"], "/payments/me");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const refresh = () => { qc.invalidateQueries({ queryKey: ["my-subscription"] }); qc.invalidateQueries({ queryKey: ["my-invoices"] }); qc.invalidateQueries({ queryKey: ["my-payments"] }); };

  if (isLoading) return <Loading />;
  const s = data?.data;
  if (!s) return <PageHeader title="Subscription" sub="No subscription found. Contact Zalgo Infotech." />;

  async function payAndVerify(body: { purpose: "renewal" | "upgrade"; planId?: string; billingCycle: string }, successMsg: string) {
    setBusy(true);
    try {
      const { data } = await api.post<ApiResponse<RazorpayOrder>>("/payments/create-order", body);
      const order = data.data!;
      const result = await payWithRazorpay(order, { description: order.plan?.name });
      await api.post("/payments/verify-payment", { razorpayOrderId: result.orderId, razorpayPaymentId: result.paymentId, razorpaySignature: result.signature });
      toast(successMsg); refresh();
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  }
  const payForInvoice = () => payAndVerify({ purpose: "renewal", billingCycle: s.billingCycle }, "Subscription renewed");
  const upgrade = (planId: string) => payAndVerify({ purpose: "upgrade", planId, billingCycle: s.billingCycle }, "Plan upgraded");
  return (
    <>
      <PageHeader title="Subscription" sub="Your plan, limits and billing breakdown." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Plan" value={<>{s.plan?.name} <Badge status={s.status} className="ml-2 align-middle" /></>} hint={`${s.billingCycle} · ${daysLeft(s.endsAt)} days left`} />
        <Stat label="Current bill" value={inr(s.total)} hint={`per ${s.billingCycle === "yearly" ? "year" : "month"}`} />
        <Stat label="Employee limit" value={s.employeeLimit} />
        <Stat label="Branch / device limit" value={`${s.branchLimit} / ${s.deviceLimit}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 mt-6">
        <div className="card p-5">
          <h3 className="font-bold">Billing breakdown</h3>
          <dl className="mt-3 text-sm divide-y divide-line">
            {[["Base plan", s.basePrice], ["Additional branches", s.additionalBranchTotal], ["Additional employees", s.additionalEmployeeTotal], ["Additional devices", s.additionalDeviceTotal], ["Add-ons", s.addonsTotal]].map(([l, v]) => <div key={l as string} className="flex justify-between py-2"><dt className="text-muted">{l}</dt><dd className="tabular-nums">{inr(v as string)}</dd></div>)}
            <div className="flex justify-between py-2 font-bold"><dt>Total</dt><dd className="tabular-nums">{inr(s.total)}</dd></div>
          </dl>
          <p className="text-xs text-muted mt-2">Period {fmtDate(s.startsAt)} – {fmtDate(s.endsAt)}</p>
        </div>
        <div className="card p-5">
          <h3 className="font-bold">Modules</h3>
          <ul className="mt-3 grid grid-cols-2 gap-1.5 text-sm">{(Object.keys(MODULES) as ModuleKey[]).map((m) => <li key={m} className={s.modules.includes(m) ? "" : "text-muted line-through"}>{MODULES[m]}</li>)}</ul>
        </div>
      </div>
      <h2 className="font-bold mt-8 mb-3">Available plans</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{plans.data?.data?.map((p) => {
        const isCurrent = p.name === s.plan?.name;
        return (
          <div key={p.id} className={`card p-4 ${isCurrent ? "border-brand" : ""}`}>
            <div className="font-bold">{p.name}</div>
            <div className="text-xl font-extrabold mt-1">{inr(p.monthlyPrice)}<span className="text-xs text-muted font-medium">/mo</span></div>
            <div className="text-xs text-muted mt-1">{p.includedEmployees} employees · {p.includedBranches} branch{p.includedBranches > 1 ? "es" : ""} · {p.modules.length} modules</div>
            {!isCurrent && <Button size="sm" className="w-full mt-3" disabled={busy} onClick={() => upgrade(p.id)}>Upgrade</Button>}
          </div>
        );
      })}</div>
      <h2 className="font-bold mt-8 mb-3">Invoices</h2>
      <InvoiceTable rows={invoices.data?.data ?? []} pending={busy} onPay={() => payForInvoice()} />
      <h2 className="font-bold mt-8 mb-3">Payments</h2>
      <div className="card divide-y divide-line">
        {(payments.data?.data ?? []).map((p) => (
          <div key={p.id} className="px-5 py-3 text-sm flex justify-between gap-3">
            <span className="capitalize">{p.purpose.replace("_", " ")}{p.razorpayPaymentId && <span className="text-muted text-xs"> · {p.razorpayPaymentId}</span>}</span>
            <span className="flex items-center gap-3"><span className="tabular-nums">{inr(p.amount)}</span><Badge status={p.status} /><span className="text-muted whitespace-nowrap">{fmtDate(p.createdAt)}</span></span>
          </div>
        ))}
        {!payments.data?.data?.length && <div className="px-5 py-3 text-sm text-muted">No payments yet.</div>}
      </div>
      <h2 className="font-bold mt-8 mb-3">History</h2>
      <div className="card divide-y divide-line">{s.history.map((h) => <div key={h.id} className="px-5 py-3 text-sm flex justify-between gap-3"><span><span className="font-semibold capitalize">{h.action.replace("_", " ")}</span>{h.note && <span className="text-muted"> — {h.note}</span>}</span><span className="text-muted whitespace-nowrap">{fmtDate(h.createdAt)}</span></div>)}{!s.history.length && <div className="px-5 py-3 text-sm text-muted">No changes yet.</div>}</div>
    </>
  );
}
