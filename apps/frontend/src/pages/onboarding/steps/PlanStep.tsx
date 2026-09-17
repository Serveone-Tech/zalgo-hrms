import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { cn, inr } from "@/lib/utils";
import { MODULES, type ModuleKey } from "@hrms/shared-types";
import type { StatusResponse } from "../onboarding.types";

export const PLAN_SESSION_KEY = "onboarding-plan-choice";

export function PlanStep({ status }: { status: StatusResponse }) {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [selected, setSelected] = useState<string | null>(status.plans[0]?.id ?? null);
  const [busy, setBusy] = useState<"trial" | "pay" | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const plan = status.plans.find((p) => p.id === selected);
  const price = plan ? Number(cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice) : 0;
  const yearlySavingsPct = plan && Number(plan.monthlyPrice) > 0 ? Math.round((1 - Number(plan.yearlyPrice) / (Number(plan.monthlyPrice) * 12)) * 100) : 0;
  const gst = Math.round(price * 18) / 100;

  async function startTrial() {
    if (!plan) return;
    setBusy("trial");
    try {
      await api.post("/onboarding/choose-plan", { planId: plan.id, billingCycle: cycle, startTrial: true });
      qc.invalidateQueries({ queryKey: ["onboarding-status"] });
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(null); }
  }
  function continueToPayment() {
    if (!plan) return;
    sessionStorage.setItem(PLAN_SESSION_KEY, JSON.stringify({ planId: plan.id, billingCycle: cycle }));
    setBusy("pay");
    api.post("/onboarding/choose-plan", { planId: plan.id, billingCycle: cycle, startTrial: false })
      .then(() => qc.invalidateQueries({ queryKey: ["onboarding-status"] }))
      .catch((e) => toast(errMsg(e), "error")).finally(() => setBusy(null));
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-lg font-bold">Choose a plan</h2><p className="text-sm text-muted mt-1">You can change this anytime from Subscription.</p></div>
        <div className="inline-flex rounded-md border border-line p-0.5 text-sm">
          <button type="button" className={cn("px-3 py-1.5 rounded", cycle === "monthly" && "bg-brand text-brand-ink")} onClick={() => setCycle("monthly")}>Monthly</button>
          <button type="button" className={cn("px-3 py-1.5 rounded", cycle === "yearly" && "bg-brand text-brand-ink")} onClick={() => setCycle("yearly")}>Yearly</button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mt-5">
        {status.plans.map((p) => {
          const pPrice = Number(cycle === "yearly" ? p.yearlyPrice : p.monthlyPrice);
          return (
            <button type="button" key={p.id} onClick={() => setSelected(p.id)}
              className={cn("text-left rounded-lg border p-4 transition-colors", selected === p.id ? "border-brand ring-1 ring-brand" : "border-line hover:border-brand/50")}>
              {p.badge && <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-soft text-brand mb-2">{p.badge}</span>}
              <div className="font-bold">{p.name}</div>
              <div className="text-xl font-extrabold mt-1">{inr(pPrice)}<span className="text-xs text-muted font-medium">/{cycle === "yearly" ? "yr" : "mo"}</span></div>
              <div className="text-xs text-muted mt-1">{p.includedEmployees} employees · {p.includedBranches} branches · {p.includedDevices} devices</div>
              {p.trialDays > 0 && <div className="text-xs text-good mt-1 font-semibold">{p.trialDays}-day free trial</div>}
              <ul className="mt-3 space-y-1 text-xs">
                {p.modules.slice(0, 5).map((m) => <li key={m} className="flex items-center gap-1.5"><Check size={12} className="text-good shrink-0" /> {MODULES[m as ModuleKey] ?? m}</li>)}
                {p.modules.length > 5 && <li className="text-muted">+{p.modules.length - 5} more</li>}
              </ul>
            </button>
          );
        })}
      </div>

      {plan && (
        <div className="mt-6 border-t border-line pt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm">
            <div>Subtotal: <span className="tabular-nums">{inr(price)}</span> · GST (18%): <span className="tabular-nums">{inr(gst)}</span></div>
            <div className="font-bold">Total: <span className="tabular-nums">{inr(price + gst)}</span> {cycle === "yearly" && yearlySavingsPct > 0 && <span className="text-good font-semibold">· save {yearlySavingsPct}% yearly</span>}</div>
          </div>
          <div className="flex gap-2">
            {status.trialEnabled && plan.trialDays > 0 && <Button variant="secondary" onClick={startTrial} loading={busy === "trial"}>Start {plan.trialDays}-day free trial</Button>}
            <Button onClick={continueToPayment} loading={busy === "pay"}>Continue to payment</Button>
          </div>
        </div>
      )}
    </div>
  );
}
