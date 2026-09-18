import { Link, useParams } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { useState } from "react";
import { useGet, useAction } from "@/lib/queries";
import { PageHeader, Loading, Stat, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { fmtDate, inr, daysLeft } from "@/lib/utils";
import { MODULES, type ModuleKey } from "@hrms/shared-types";
import { InvoiceTable, type Invoice } from "@/components/InvoiceTable";
import type { Addon } from "./Addons";

type Detail = { id: string; name: string; slug: string; status: string; onboardingStatus: string; email: string | null; city: string | null; gstNumber: string | null; createdAt: string;
  subscription: null | { id: string; status: string; billingCycle: string; employeeLimit: number; branchLimit: number; deviceLimit: number; modules: string[]; basePrice: string; additionalBranchTotal: string; additionalEmployeeTotal?: string; additionalDeviceTotal?: string; addonsTotal?: string; endsAt: string; plan: { id: string; name: string } };
  branches: { id: string; name: string; city: string | null; status: string; isHeadOffice: boolean; approvedPrice: string | null }[];
  users: { id: string; name: string; email: string; isActive: boolean; lastLoginAt: string | null }[] };
type Plan = { id: string; name: string };

export default function CompanyDetail() {
  const { id } = useParams();
  const { data, isLoading } = useGet<Detail>(["company", id], `/companies/${id}`);
  const plans = useGet<Plan[]>(["plans"], "/platform/plans");
  const act = useAction([["company", id], ["companies"], ["platform-dashboard"]]);
  const [plan, setPlan] = useState<{ planId: string; billingCycle: "monthly" | "yearly" } | null>(null);
  const [extend, setExtend] = useState<number | null>(null);
  const addons = useGet<Addon[]>(["addons"], "/platform/addons");
  const attached = useGet<{ id: string; units: number; price: string; addon: Addon }[]>(["company-addons", id], `/platform/addons/company/${id}`);
  const invoices = useGet<Invoice[]>(["invoices", id], `/invoices/platform?companyId=${id}`);
  const addonAct = useAction([["company", id], ["company-addons", id], ["invoices", id]]);
  const [addAddon, setAddAddon] = useState<{ addonId: string; units: number; price: string } | null>(null);
  const [completing, setCompleting] = useState<{ planId: string; billingCycle: "monthly" | "yearly"; startTrial: boolean; markPaid: boolean } | null>(null);
  if (isLoading || !data?.data) return <Loading />;
  const c = data.data; const s = c.subscription;
  const total = s ? Number(s.basePrice) + Number(s.additionalBranchTotal) + Number(s.additionalEmployeeTotal ?? 0) + Number(s.additionalDeviceTotal ?? 0) + Number(s.addonsTotal ?? 0) : 0;

  return (
    <>
      <PageHeader title={c.name} sub={`${c.slug}${c.city ? " · " + c.city : ""}${c.gstNumber ? " · GST " + c.gstNumber : ""}`}
        actions={<>
          <Link to={`/platform/audit-logs?companyId=${c.id}`}><Button variant="secondary" size="sm"><ScrollText size={14} /> View audit log</Button></Link>
          {c.status !== "suspended" ? <Button variant="danger" size="sm" onClick={() => confirm("Suspend this company? Users will be locked out.") && act.mutate({ url: `/companies/${c.id}/status`, body: { status: "suspended" } })}>Suspend</Button>
            : <Button size="sm" onClick={() => act.mutate({ url: `/companies/${c.id}/status`, body: { status: "active" } })}>Reactivate</Button>}
        </>} />
      <div className="flex items-center gap-2 mb-5">
        <Badge status={c.status} />{s && <Badge status={s.status} />}{s && daysLeft(s.endsAt) <= 7 && daysLeft(s.endsAt) > 0 && <Badge status="expiring">Expires in {daysLeft(s.endsAt)} days</Badge>}
        {c.onboardingStatus !== "active" && <>
          <Badge status="pending">Onboarding: {c.onboardingStatus}</Badge>
          <Button size="sm" variant="secondary" onClick={() => setCompleting({ planId: "", billingCycle: "monthly", startTrial: true, markPaid: false })}>Complete onboarding</Button>
        </>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Plan" value={s?.plan.name ?? "None"} hint={s ? `${s.billingCycle} · renews ${fmtDate(s.endsAt)}` : undefined} />
        <Stat label="Current bill" value={inr(total)} hint={s ? `${inr(s.basePrice)} base + ${inr(s.additionalBranchTotal)} branches + ${inr(s.addonsTotal ?? 0)} add-ons` : undefined} />
        <Stat label="Limits" value={`${s?.employeeLimit ?? 0} / ${s?.branchLimit ?? 0} / ${s?.deviceLimit ?? 0}`} hint="employees / branches / devices" />
        <Stat label="Users" value={c.users.length} hint={`${c.branches.filter((b) => b.status === "active").length} active branches`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] mt-6">
        <div className="space-y-4">
          <div className="card">
            <div className="px-5 py-3 border-b border-line font-bold">Branches</div>
            <table className="w-full"><tbody>{c.branches.map((b) => (
              <tr key={b.id}><td className="td font-medium">{b.name}{b.isHeadOffice && <span className="ml-2 text-[11px] text-muted">Head office</span>}</td><td className="td text-muted">{b.city ?? "—"}</td><td className="td">{Number(b.approvedPrice) ? `${inr(b.approvedPrice)}/mo` : "Included"}</td><td className="td"><Badge status={b.status} /></td></tr>
            ))}</tbody></table>
          </div>
          <div className="card">
            <div className="px-5 py-3 border-b border-line font-bold">Users</div>
            <table className="w-full"><tbody>{c.users.map((u) => (
              <tr key={u.id}><td className="td font-medium">{u.name}<div className="text-xs text-muted">{u.email}</div></td><td className="td text-muted">Last login {fmtDate(u.lastLoginAt)}</td><td className="td"><Badge status={u.isActive ? "active" : "inactive"} /></td></tr>
            ))}</tbody></table>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-bold">Subscription actions</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPlan({ planId: s?.plan.id ?? "", billingCycle: (s?.billingCycle as "monthly") ?? "monthly" })}>Change plan</Button>
              <Button size="sm" variant="secondary" onClick={() => setExtend(30)}>Extend</Button>
              {s?.status !== "suspended" ? <Button size="sm" variant="secondary" onClick={() => act.mutate({ url: `/subscriptions/company/${c.id}/status`, body: { status: "suspended" } })}>Suspend subscription</Button>
                : <Button size="sm" onClick={() => act.mutate({ url: `/subscriptions/company/${c.id}/status`, body: { status: "active" } })}>Activate subscription</Button>}
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between"><h3 className="font-bold">Add-ons</h3><Button size="sm" variant="secondary" onClick={() => setAddAddon({ addonId: "", units: 1, price: "" })}>Attach</Button></div>
            <ul className="mt-3 divide-y divide-line text-sm">
              {attached.data?.data?.map((a) => <li key={a.id} className="flex items-center justify-between py-2 gap-2"><span>{a.addon.name} <span className="text-muted">×{a.units} · {inr(Number(a.price) * a.units)}/{s?.billingCycle === "yearly" ? "yr" : "mo"}</span></span><Button size="sm" variant="ghost" onClick={() => addonAct.mutate({ method: "delete", url: `/platform/addons/company/${c.id}/${a.id}` })}>Remove</Button></li>)}
              {!attached.data?.data?.length && <li className="py-2 text-muted">No add-ons attached.</li>}
            </ul>
          </div>
          <div className="card p-5">
            <h3 className="font-bold">Enabled modules</h3>
            <ul className="mt-3 grid grid-cols-2 gap-1.5 text-sm">
              {(Object.keys(MODULES) as ModuleKey[]).map((m) => <li key={m} className={s?.modules.includes(m) ? "text-ink" : "text-muted line-through"}>{MODULES[m]}</li>)}
            </ul>
          </div>
        </div>
      </div>

      <h2 className="font-bold mt-8 mb-3">Invoices</h2>
      <InvoiceTable rows={invoices.data?.data ?? []} pending={addonAct.isPending} onStatus={(iid, status) => addonAct.mutate({ url: `/invoices/platform/${iid}/status`, body: { status } })} />

      <Modal open={!!addAddon} onClose={() => setAddAddon(null)} title="Attach add-on">
        {addAddon && <div className="space-y-4">
          <Field label="Add-on"><select className="field" value={addAddon.addonId} onChange={(e) => setAddAddon({ ...addAddon, addonId: e.target.value })}><option value="">Select…</option>{addons.data?.data?.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name} · {inr(s?.billingCycle === "yearly" ? a.yearlyPrice : a.monthlyPrice)}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Units"><input className="field" type="number" min={1} value={addAddon.units} onChange={(e) => setAddAddon({ ...addAddon, units: Number(e.target.value) })} /></Field>
            <Field label="Price override (₹, optional)"><input className="field" type="number" min={0} placeholder="catalog price" value={addAddon.price} onChange={(e) => setAddAddon({ ...addAddon, price: e.target.value })} /></Field>
          </div>
          <p className="text-xs text-muted">Limits and modules update immediately; an invoice is generated.</p>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAddAddon(null)}>Cancel</Button><Button loading={addonAct.isPending} disabled={!addAddon.addonId} onClick={() => addonAct.mutate({ url: `/platform/addons/company/${c.id}`, body: { addonId: addAddon.addonId, units: addAddon.units, price: addAddon.price === "" ? undefined : Number(addAddon.price) } }, { onSuccess: () => setAddAddon(null) })}>Attach</Button></div>
        </div>}
      </Modal>
      <Modal open={!!plan} onClose={() => setPlan(null)} title="Change plan">
        {plan && <div className="space-y-4">
          <Field label="Plan"><select className="field" value={plan.planId} onChange={(e) => setPlan({ ...plan, planId: e.target.value })}><option value="">Select…</option>{plans.data?.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Billing cycle"><select className="field" value={plan.billingCycle} onChange={(e) => setPlan({ ...plan, billingCycle: e.target.value as "monthly" })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
          <p className="text-xs text-muted">Approved extra branches carry over. Limits and modules update immediately for all users.</p>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPlan(null)}>Cancel</Button><Button loading={act.isPending} disabled={!plan.planId} onClick={() => act.mutate({ url: `/subscriptions/company/${c.id}/assign`, body: plan }, { onSuccess: () => setPlan(null) })}>Apply plan</Button></div>
        </div>}
      </Modal>
      <Modal open={extend !== null} onClose={() => setExtend(null)} title="Extend subscription">
        <div className="space-y-4">
          <Field label="Days to add"><input className="field" type="number" min={1} value={extend ?? 30} onChange={(e) => setExtend(Number(e.target.value))} /></Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setExtend(null)}>Cancel</Button><Button loading={act.isPending} onClick={() => act.mutate({ url: `/subscriptions/company/${c.id}/extend`, body: { days: extend } }, { onSuccess: () => setExtend(null) })}>Extend by {extend} days</Button></div>
        </div>
      </Modal>
      <Modal open={!!completing} onClose={() => setCompleting(null)} title="Complete onboarding">
        {completing && <div className="space-y-4">
          <Field label="Plan"><select className="field" value={completing.planId} onChange={(e) => setCompleting({ ...completing, planId: e.target.value })}><option value="">Select…</option>{plans.data?.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Billing cycle"><select className="field" value={completing.billingCycle} onChange={(e) => setCompleting({ ...completing, billingCycle: e.target.value as "monthly" })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={completing.startTrial} onChange={(e) => setCompleting({ ...completing, startTrial: e.target.checked })} /> Start trial</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={completing.markPaid} onChange={(e) => setCompleting({ ...completing, markPaid: e.target.checked })} /> Mark as paid</label>
          </div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCompleting(null)}>Cancel</Button><Button loading={act.isPending} disabled={!completing.planId} onClick={() => act.mutate({ url: `/companies/${c.id}/complete-onboarding`, body: completing }, { onSuccess: () => setCompleting(null) })}>Complete</Button></div>
        </div>}
      </Modal>
    </>
  );
}
