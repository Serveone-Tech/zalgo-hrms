import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { CompanyProfileForm } from "@/components/company/CompanyProfileForm";
import { companyProfileSchema, headOfficeSchema } from "@/lib/companySchema";
import { fmtDate } from "@/lib/utils";

type Row = { id: string; name: string; slug: string; status: string; onboardingStatus: string; email: string | null; city: string | null; planName: string | null; subscriptionStatus: string | null; endsAt: string | null; branchCount: number; userCount: number; createdAt: string };
type Plan = { id: string; name: string; monthlyPrice: string };

const schema = z.object({
  company: companyProfileSchema,
  headOffice: headOfficeSchema,
  planId: z.string().uuid("Select a plan"), billingCycle: z.enum(["monthly", "yearly"]), startTrial: z.boolean(), markPaid: z.boolean(),
  admin: z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8, "Min 8 characters") }),
});
type Form = z.infer<typeof schema>;

export default function Companies() {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const { data, isLoading } = useGet<Row[]>(["companies", q], `/companies?q=${encodeURIComponent(q)}&limit=50`);
  const plans = useGet<Plan[]>(["plans"], "/platform/plans");
  const act = useAction<ReturnType<typeof toBody>>([["companies"], ["platform-dashboard"]]);
  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<Form>({
    resolver: zodResolver(schema), defaultValues: { billingCycle: "monthly", startTrial: true, markPaid: false, headOffice: { name: "Head Office" }, company: { country: "India", timezone: "Asia/Kolkata" } as any },
  });

  return (
    <>
      <PageHeader title="Companies" sub="Tenants on the platform." actions={<Button onClick={() => setOpen(true)}><Plus size={16} /> New company</Button>} />
      <input className="field max-w-sm mb-4" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No companies yet. Create the first tenant." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[840px]">
            <thead><tr><th className="th">Company</th><th className="th">Plan</th><th className="th">Subscription</th><th className="th">Branches</th><th className="th">Users</th><th className="th">Renews</th><th className="th">Status</th><th className="th">Onboarding</th></tr></thead>
            <tbody>{data.data.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2/60">
                <td className="td"><Link to={`/platform/companies/${c.id}`} className="font-semibold hover:text-brand">{c.name}</Link><div className="text-xs text-muted">{c.slug}{c.city ? ` · ${c.city}` : ""}</div></td>
                <td className="td">{c.planName ?? "—"}</td>
                <td className="td"><Badge status={c.subscriptionStatus ?? "inactive"} /></td>
                <td className="td tabular-nums">{c.branchCount}</td>
                <td className="td tabular-nums">{c.userCount}</td>
                <td className="td">{fmtDate(c.endsAt)}</td>
                <td className="td"><Badge status={c.status} /></td>
                <td className="td">{c.onboardingStatus === "active" ? <Badge status="active">Done</Badge> : <Badge status="pending">{c.onboardingStatus}</Badge>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Create company" wide>
        <form onSubmit={handleSubmit((v) => act.mutate({ url: "/companies", body: toBody(v) }, { onSuccess: () => { setOpen(false); reset(); } }))} className="space-y-5" noValidate>
          <CompanyProfileForm register={register} errors={errors} setValue={setValue} />
          <div className="border-t border-line pt-4">
            <h3 className="font-bold text-sm mb-3">Subscription</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Plan" error={errors.planId?.message}><select className="field" {...register("planId")}><option value="">Select…</option>{plans.data?.data?.map((p) => <option key={p.id} value={p.id}>{p.name} · ₹{Number(p.monthlyPrice).toLocaleString("en-IN")}/mo</option>)}</select></Field>
              <Field label="Billing"><select className="field" {...register("billingCycle")}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
            </div>
            <div className="flex gap-6 mt-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("startTrial")} /> Free trial (plan's trial days)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("markPaid")} /> Mark as paid (offline payment)</label>
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="font-bold text-sm mb-3">Company admin login</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Name" error={errors.admin?.name?.message}><input className="field" {...register("admin.name")} /></Field>
              <Field label="Email" error={errors.admin?.email?.message}><input className="field" type="email" {...register("admin.email")} /></Field>
              <Field label="Password" error={errors.admin?.password?.message}><input className="field" type="text" autoComplete="off" {...register("admin.password")} /></Field>
            </div>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={act.isPending}>Create company</Button></div>
        </form>
      </Modal>
    </>
  );
}

function toBody(v: Form) {
  const { company, ...rest } = v;
  return { ...company, ...rest };
}
