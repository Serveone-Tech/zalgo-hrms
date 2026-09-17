import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { PageHeader, Loading, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { inr } from "@/lib/utils";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@hrms/shared-types";

type Plan = { id: string; name: string; slug: string; description: string | null; monthlyPrice: string; yearlyPrice: string; trialDays: number; includedEmployees: number; includedBranches: number; includedDevices: number; additionalBranchPrice: string; additionalEmployeePrice: string; additionalDevicePrice: string; modules: string[]; isActive: boolean; sortOrder: number };
const n = z.coerce.number().min(0);
const schema = z.object({
  name: z.string().min(2), slug: z.string().min(2).regex(/^[a-z0-9-]+$/), description: z.string().optional(),
  monthlyPrice: n, yearlyPrice: n, trialDays: n.int(), includedEmployees: n.int().min(1), includedBranches: n.int().min(1), includedDevices: n.int(),
  additionalBranchPrice: n, additionalEmployeePrice: n, additionalDevicePrice: n, modules: z.array(z.string()).min(1, "Select at least one module"), sortOrder: n.int(), isActive: z.boolean(),
});
type Form = z.infer<typeof schema>;

export default function Plans() {
  const { data, isLoading } = useGet<Plan[]>(["plans"], "/platform/plans");
  const act = useAction<Form>([["plans"]]);
  const [edit, setEdit] = useState<Plan | "new" | null>(null);
  const form = useForm<Form>({ resolver: zodResolver(schema) });
  const openEdit = (p: Plan | "new") => {
    setEdit(p);
    form.reset(p === "new" ? { modules: ["employees", "attendance", "leaves"], isActive: true, trialDays: 14, includedBranches: 1, includedEmployees: 25, includedDevices: 1, sortOrder: 0, monthlyPrice: 0, yearlyPrice: 0, additionalBranchPrice: 0, additionalEmployeePrice: 0, additionalDevicePrice: 0 }
      : { ...p, description: p.description ?? "", monthlyPrice: +p.monthlyPrice, yearlyPrice: +p.yearlyPrice, additionalBranchPrice: +p.additionalBranchPrice, additionalEmployeePrice: +p.additionalEmployeePrice, additionalDevicePrice: +p.additionalDevicePrice });
  };
  const { register, handleSubmit, formState: { errors } } = form;
  const num = (name: keyof Form, label: string) => <Field label={label} error={errors[name]?.message as string}><input className="field" type="number" step="any" {...register(name)} /></Field>;

  return (
    <>
      <PageHeader title="Subscription plans" sub="Pricing, limits and modules — nothing is hardcoded." actions={<Button onClick={() => openEdit("new")}><Plus size={16} /> New plan</Button>} />
      {isLoading ? <Loading /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data?.data?.map((p) => (
            <div key={p.id} className="card p-5 hover:border-brand transition-colors">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-extrabold text-lg">{p.name}</h3>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge status={p.isActive ? "active" : "disabled"} />
                  <button title="Edit plan" onClick={() => openEdit(p)} className="p-1 rounded text-muted hover:text-ink hover:bg-surface-2"><Pencil size={14} /></button>
                  <button title="Delete plan" onClick={() => confirm(`Disable "${p.name}"? Existing companies keep it; it just won't be offered for new subscriptions.`) && act.mutate({ method: "delete", url: `/platform/plans/${p.id}` })}
                    className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="mt-2 text-2xl font-extrabold tabular-nums">{inr(p.monthlyPrice)}<span className="text-sm font-medium text-muted">/mo</span></div>
              <div className="text-xs text-muted">{inr(p.yearlyPrice)}/yr · {p.trialDays}-day trial</div>
              <dl className="mt-4 text-[13px] space-y-1">
                <div className="flex justify-between"><dt className="text-muted">Employees</dt><dd className="font-semibold">{p.includedEmployees} <span className="text-muted font-normal">+{inr(p.additionalEmployeePrice)}/extra</span></dd></div>
                <div className="flex justify-between"><dt className="text-muted">Branches</dt><dd className="font-semibold">{p.includedBranches} <span className="text-muted font-normal">+{inr(p.additionalBranchPrice)}/extra</span></dd></div>
                <div className="flex justify-between"><dt className="text-muted">Devices</dt><dd className="font-semibold">{p.includedDevices} <span className="text-muted font-normal">+{inr(p.additionalDevicePrice)}/extra</span></dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-1">{p.modules.map((m) => <span key={m} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium">{MODULES[m as ModuleKey] ?? m}</span>)}</div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New plan" : `Edit ${(edit as Plan)?.name}`} wide>
        <form noValidate className="space-y-5" onSubmit={handleSubmit((v) => act.mutate({ method: edit === "new" ? "post" : "put", url: edit === "new" ? "/platform/plans" : `/platform/plans/${(edit as Plan).id}`, body: v }, { onSuccess: () => setEdit(null) }))}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Plan name" error={errors.name?.message}><input className="field" {...register("name")} /></Field>
            <Field label="Slug" error={errors.slug?.message}><input className="field" {...register("slug")} /></Field>
            <Field label="Description" className="sm:col-span-2"><input className="field" {...register("description")} /></Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">{num("monthlyPrice", "Monthly price (₹)")}{num("yearlyPrice", "Yearly price (₹)")}{num("trialDays", "Trial days")}</div>
          <div className="grid sm:grid-cols-3 gap-4">{num("includedEmployees", "Included employees")}{num("includedBranches", "Included branches")}{num("includedDevices", "Included devices")}</div>
          <div className="grid sm:grid-cols-3 gap-4">{num("additionalEmployeePrice", "Extra employee ₹/mo")}{num("additionalBranchPrice", "Extra branch ₹/mo")}{num("additionalDevicePrice", "Extra device ₹/mo")}</div>
          <Field label="Modules included" error={errors.modules?.message}>
            <div className="grid sm:grid-cols-3 gap-2">{MODULE_KEYS.map((m) => <label key={m} className="flex items-center gap-2 text-sm rounded-md border border-line px-3 py-2"><input type="checkbox" value={m} {...register("modules")} />{MODULES[m]}</label>)}</div>
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">{num("sortOrder", "Sort order")}<Field label="Status"><label className="flex items-center gap-2 h-10 text-sm"><input type="checkbox" {...register("isActive")} /> Active (visible to companies)</label></Field></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" loading={act.isPending}>Save plan</Button></div>
        </form>
      </Modal>
    </>
  );
}
