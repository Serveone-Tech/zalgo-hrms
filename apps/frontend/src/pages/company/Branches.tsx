import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { fmtDate, inr } from "@/lib/utils";

type Branch = { id: string; name: string; code: string | null; city: string | null; state: string | null; status: string; isHeadOffice: boolean; approvedPrice: string | null };
type Req = { id: string; name: string; city: string | null; status: string; defaultPrice: string; approvedPrice: string | null; rejectionReason: string | null; createdAt: string };
const schema = z.object({
  name: z.string().min(2), code: z.string().optional(), address: z.string().optional(), city: z.string().optional(), state: z.string().optional(), pinCode: z.string().optional(),
  expectedEmployees: z.coerce.number().int().min(0), expectedDevices: z.coerce.number().int().min(0), reason: z.string().optional(), branchType: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export default function Branches() {
  const can = useAuth((s) => s.can);
  const branches = useGet<Branch[]>(["branches"], "/branches");
  const reqs = useGet<Req[]>(["my-branch-requests"], "/branches/requests");
  const act = useAction<Form>([["branches"], ["my-branch-requests"], ["company-dashboard"]]);
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { expectedEmployees: 0, expectedDevices: 0, branchType: "Branch" } });

  return (
    <>
      <PageHeader title="Branches" sub="New branches need approval from Zalgo before they go live." actions={can("branch.request") && <Button onClick={() => setOpen(true)}><Plus size={16} /> Request a branch</Button>} />
      {branches.isLoading ? <Loading /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[560px]">
          <thead><tr><th className="th">Branch</th><th className="th">Location</th><th className="th">Pricing</th><th className="th">Status</th></tr></thead>
          <tbody>{branches.data?.data?.map((b) => <tr key={b.id}>
            <td className="td font-semibold">{b.name}{b.isHeadOffice && <span className="ml-2 text-[11px] font-medium text-muted">Head office</span>}{b.code && <div className="text-xs text-muted font-normal">{b.code}</div>}</td>
            <td className="td text-muted">{[b.city, b.state].filter(Boolean).join(", ") || "—"}</td>
            <td className="td">{Number(b.approvedPrice) ? `${inr(b.approvedPrice)}/mo` : "Included in plan"}</td>
            <td className="td"><Badge status={b.status} /></td>
          </tr>)}</tbody>
        </table></div>
      )}
      <h2 className="font-bold mt-8 mb-3">Requests</h2>
      {reqs.isLoading ? <Loading /> : !reqs.data?.data?.length ? <Empty text="No branch requests yet." /> : (
        <div className="space-y-2">{reqs.data.data.map((r) => (
          <div key={r.id} className="card px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div><div className="font-semibold">{r.name} <Badge status={r.status} className="ml-2" /></div><div className="text-xs text-muted mt-0.5">{r.city ?? "—"} · requested {fmtDate(r.createdAt)} · {Number(r.defaultPrice) ? `est. ${inr(r.defaultPrice)}/mo` : "within plan limit"}</div>{r.rejectionReason && <div className="text-sm text-danger mt-1">Rejected: {r.rejectionReason}</div>}</div>
            {r.status === "pending" && can("branch.request") && <Button size="sm" variant="ghost" onClick={() => act.mutate({ url: `/branches/requests/${r.id}/cancel` })}>Cancel request</Button>}
          </div>
        ))}</div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Request a new branch" wide>
        <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => act.mutate({ url: "/branches/requests", body: v }, { onSuccess: () => { setOpen(false); reset(); } }))}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Branch name" error={errors.name?.message}><input className="field" {...register("name")} /></Field>
            <Field label="Branch code"><input className="field" {...register("code")} /></Field>
            <Field label="Address" className="sm:col-span-2"><input className="field" {...register("address")} /></Field>
            <Field label="City"><input className="field" {...register("city")} /></Field>
            <Field label="State"><input className="field" {...register("state")} /></Field>
            <Field label="PIN code"><input className="field" {...register("pinCode")} /></Field>
            <Field label="Branch type"><select className="field" {...register("branchType")}><option>Branch</option><option>Warehouse</option><option>Factory</option><option>Sales office</option><option>Other</option></select></Field>
            <Field label="Expected employees"><input className="field" type="number" min={0} {...register("expectedEmployees")} /></Field>
            <Field label="Expected devices"><input className="field" type="number" min={0} {...register("expectedDevices")} /></Field>
            <Field label="Reason for branch" className="sm:col-span-2"><textarea className="field" rows={2} {...register("reason")} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={act.isPending}>Submit for approval</Button></div>
        </form>
      </Modal>
    </>
  );
}
