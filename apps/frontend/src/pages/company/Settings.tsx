import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationSettings } from "./system/NotificationSettings";

type C = { name: string; logoUrl: string | null; email: string | null; mobile: string | null; website: string | null; address: string | null; timezone: string };
export default function SettingsPage() {
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<C>(["company-settings"], "/company/settings");
  const act = useAction([["company-settings"]]);
  const { register, handleSubmit, reset } = useForm<C>();
  useEffect(() => { if (data?.data) reset(data.data); }, [data, reset]);
  if (isLoading) return <Loading />;
  return (
    <>
      <PageHeader title="Settings" sub="Company profile and workspace preferences." />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <form className="card p-5 space-y-4" noValidate onSubmit={handleSubmit((v) => act.mutate({ method: "put", url: "/company/settings", body: { logoUrl: v.logoUrl ?? "", email: v.email ?? "", mobile: v.mobile ?? "", website: v.website ?? "", address: v.address ?? "", timezone: v.timezone } }))}>
          <h3 className="font-bold">Company profile</h3>
          <Field label="Company name"><input className="field" disabled value={data?.data?.name ?? ""} /></Field>
          <Field label="Logo URL"><input className="field" placeholder="https://…" {...register("logoUrl")} /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Email"><input className="field" type="email" {...register("email")} /></Field>
            <Field label="Mobile"><input className="field" {...register("mobile")} /></Field>
            <Field label="Website"><input className="field" {...register("website")} /></Field>
            <Field label="Timezone"><input className="field" {...register("timezone")} /></Field>
          </div>
          <Field label="Address"><textarea className="field" rows={2} {...register("address")} /></Field>
          {can("company.settings") && <div className="flex justify-end"><Button type="submit" loading={act.isPending}>Save changes</Button></div>}
        </form>
        <div className="card p-5"><h3 className="font-bold">Appearance</h3><p className="text-sm text-muted mt-1 mb-3">Light, dark, or follow your device.</p><ThemeToggle /></div>
      </div>
      {can("company.settings") && <div className="mt-8"><h2 className="font-bold text-lg mb-3">Notifications — email, SMS, WhatsApp</h2><NotificationSettings /></div>}
    </>
  );
}
