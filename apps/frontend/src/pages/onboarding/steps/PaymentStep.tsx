import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/page";
import { payWithRazorpay, type RazorpayOrder } from "@/lib/razorpay";
import { inr } from "@/lib/utils";
import type { ApiResponse } from "@hrms/shared-types";
import type { StatusResponse } from "../onboarding.types";
import { PLAN_SESSION_KEY } from "./PlanStep";

export function PaymentStep({ status, onBack }: { status: StatusResponse; onBack: () => void }) {
  const stored = sessionStorage.getItem(PLAN_SESSION_KEY);
  const choice = stored ? (JSON.parse(stored) as { planId: string; billingCycle: "monthly" | "yearly" }) : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();

  // No order pending in this browser session (e.g. page reload) — send them back to re-pick a plan.
  useEffect(() => { if (!choice) onBack(); }, [choice, onBack]);
  if (!choice) return <Loading />;

  const plan = status.plans.find((p) => p.id === choice.planId);
  const subtotal = plan ? Number(choice.billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice) : 0;
  const total = subtotal + Math.round(subtotal * 18) / 100;

  async function pay() {
    setError(null); setBusy(true);
    try {
      const { data } = await api.post<ApiResponse<RazorpayOrder>>("/onboarding/choose-plan", { planId: choice!.planId, billingCycle: choice!.billingCycle, startTrial: false });
      const order = data.data!;
      const result = await payWithRazorpay(order, { description: order.plan?.name });
      await api.post("/onboarding/verify-payment", { razorpayOrderId: result.orderId, razorpayPaymentId: result.paymentId, razorpaySignature: result.signature });
      sessionStorage.removeItem(PLAN_SESSION_KEY);
      setDone(true);
      qc.invalidateQueries({ queryKey: ["onboarding-status"] });
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="card p-10 text-center">
        <CheckCircle2 size={40} className="mx-auto text-good" />
        <h2 className="text-lg font-bold mt-3">You're all set!</h2>
        <p className="text-sm text-muted mt-1">Redirecting you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="card p-6 max-w-md mx-auto text-center">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4"><ArrowLeft size={14} /> Back to plans</button>
      <h2 className="text-lg font-bold">Complete your payment</h2>
      <p className="text-sm text-muted mt-1">Secure checkout via Razorpay.</p>
      <div className="mt-5 rounded-lg border border-line p-4 text-sm text-left">
        <div className="flex justify-between"><span className="text-muted">Plan</span><span className="font-semibold">{plan?.name}</span></div>
        <div className="flex justify-between mt-1"><span className="text-muted">Billing</span><span className="capitalize">{choice.billingCycle}</span></div>
        <div className="flex justify-between mt-1 font-bold border-t border-line pt-1"><span>Total (GST incl.)</span><span className="tabular-nums">{inr(total)}</span></div>
      </div>
      {error && <p className="text-sm text-danger rounded-md bg-danger/10 px-3 py-2 mt-4">{error}</p>}
      <Button size="lg" className="w-full mt-5" onClick={pay} loading={busy}>{error ? "Retry payment" : `Pay ${inr(total)} securely`}</Button>
    </div>
  );
}
