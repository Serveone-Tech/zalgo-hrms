import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { PageHeader, Loading, Field, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { inr } from "@/lib/utils";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@hrms/shared-types";

export type Addon = { id: string; name: string; slug: string; description: string | null; type: string; quantity: number; moduleKey: string | null; monthlyPrice: string; yearlyPrice: string; isActive: boolean };
const schema = z.object({ name: z.string().min(2), slug: z.string().min(2).regex(/^[a-z0-9-]+$/), description: z.string().optional(), type: z.enum(["employee_pack", "device", "storage", "module", "custom"]), quantity: z.coerce.number().int().min(1), moduleKey: z.string().optional(), monthlyPrice: z.coerce.number().min(0), yearlyPrice: z.coerce.number().min(0), isActive: z.boolean() });
type Form = z.infer<typeof schema>;
const typeLabel: Record<string, string> = { employee_pack: "Employee pack", device: "Device slot", storage: "Storage", module: "Module unlock", custom: "Custom" };

export default function Addons() {
  const { data, isLoading } = useGet<Addon[]>(["addons"], "/platform/addons");
  const act = useAction<Form>([["addons"]]);
  const [edit, setEdit] = useState<Addon | "new" | null>(null);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) });
  const type = watch("type");
  const open = (a: Addon | "new") => { setEdit(a); reset(a === "new" ? { type: "custom", quantity: 1, isActive: true, monthlyPrice: 0, yearlyPrice: 0 } : { ...a, description: a.description ?? "", moduleKey: a.moduleKey ?? undefined, type: a.type as Form["type"], monthlyPrice: +a.monthlyPrice, yearlyPrice: +a.yearlyPrice }); };
  return (
    <>
      <PageHeader title="Add-ons" sub="Extras a company can buy on top of its plan. Attach them from a company's page." actions={<Button onClick={() => open("new")}><Plus size={16} /> New add-on</Button>} />
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No add-ons yet." /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.data.map((a) => (
          <button key={a.id} onClick={() => open(a)} className="card p-4 text-left hover:border-brand transition-colors">
            <div className="flex justify-between items-start"><h3 className="font-bold">{a.name}</h3><Badge status={a.isActive ? "active" : "disabled"} /></div>
            <p className="text-xs text-muted mt-0.5">{typeLabel[a.type]}{a.type === "employee_pack" || a.type === "device" ? ` · ${a.quantity} units` : ""}{a.moduleKey ? ` · ${MODULES[a.moduleKey as ModuleKey]}` : ""}</p>
            <div className="mt-3 text-lg font-extrabold">{inr(a.monthlyPrice)}<span className="text-xs text-muted font-medium">/mo</span> <span className="text-sm text-muted font-medium">· {inr(a.yearlyPrice)}/yr</span></div>
            {a.description && <p className="text-sm text-muted mt-1">{a.description}</p>}
          </button>
        ))}</div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New add-on" : `Edit ${(edit as Addon)?.name}`}>
        <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => act.mutate({ method: edit === "new" ? "post" : "put", url: edit === "new" ? "/platform/addons" : `/platform/addons/${(edit as Addon).id}`, body: { ...v, moduleKey: v.type === "module" ? v.moduleKey : undefined } }, { onSuccess: () => setEdit(null) }))}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Name" error={errors.name?.message}><input className="field" {...register("name")} /></Field>
            <Field label="Slug" error={errors.slug?.message}><input className="field" {...register("slug")} /></Field>
            <Field label="Type"><select className="field" {...register("type")}>{Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            {type === "module" ? <Field label="Module to unlock"><select className="field" {...register("moduleKey")}>{MODULE_KEYS.map((m) => <option key={m} value={m}>{MODULES[m]}</option>)}</select></Field>
              : <Field label="Units per add-on (e.g. 25 employees)"><input className="field" type="number" min={1} {...register("quantity")} /></Field>}
            <Field label="Monthly price (₹)"><input className="field" type="number" {...register("monthlyPrice")} /></Field>
            <Field label="Yearly price (₹)"><input className="field" type="number" {...register("yearlyPrice")} /></Field>
            <Field label="Description" className="sm:col-span-2"><input className="field" {...register("description")} /></Field>
            <Field label="Status"><label className="flex items-center gap-2 h-10 text-sm"><input type="checkbox" {...register("isActive")} /> Active</label></Field>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" loading={act.isPending}>Save add-on</Button></div>
        </form>
      </Modal>
    </>
  );
}
