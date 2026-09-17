import type { FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { Field } from "@/components/ui/page";
import { COMPANY_SIZES, INDUSTRIES, type CompanyProfileForm as Profile, type HeadOfficeForm as HeadOffice } from "@/lib/companySchema";

export type ProfileFormValues = { company: Profile; headOffice: HeadOffice };

// Shared by the Super Admin "New company" modal and the self-service onboarding wizard —
// both must collect identical company profile fields (single source of truth).
// Loosely typed (any) on purpose: the host form always has extra fields (admin, planId, …)
// that don't structurally unify with a generic ProfileFormValues through react-hook-form's types.
export function CompanyProfileForm({ register, errors, setValue }: {
  register: UseFormRegister<any>; errors: FieldErrors<any>; setValue: UseFormSetValue<any>;
}) {
  const e = (errors.company ?? {}) as FieldErrors<Profile>; const eh = (errors.headOffice ?? {}) as FieldErrors<HeadOffice>;

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Company name" error={e.name?.message as string}>
          <input className="field" {...register("company.name" as any, {
            onChange: (ev) => setValue("company.slug" as any, ev.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")),
          })} />
        </Field>
        <Field label="Slug (URL id)" error={e.slug?.message as string}><input className="field" {...register("company.slug" as any)} /></Field>
        <Field label="Industry">
          <select className="field" {...register("company.industry" as any)}>
            <option value="">Select…</option>{INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Company size">
          <select className="field" {...register("company.companySize" as any)}>
            <option value="">Select…</option>{COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
          </select>
        </Field>
        <Field label="Company email" error={e.email?.message as string}><input className="field" type="email" {...register("company.email" as any)} /></Field>
        <Field label="Mobile"><input className="field" {...register("company.mobile" as any)} /></Field>
        <Field label="Website"><input className="field" placeholder="https://…" {...register("company.website" as any)} /></Field>
        <Field label="GST number"><input className="field" {...register("company.gstNumber" as any)} /></Field>
        <Field label="PAN number"><input className="field" {...register("company.panNumber" as any)} /></Field>
        <Field label="Timezone"><input className="field" {...register("company.timezone" as any)} /></Field>
        <Field label="Address" className="sm:col-span-2"><input className="field" {...register("company.address" as any)} /></Field>
        <Field label="Country"><input className="field" {...register("company.country" as any)} /></Field>
        <Field label="State"><input className="field" {...register("company.state" as any)} /></Field>
        <Field label="City"><input className="field" {...register("company.city" as any)} /></Field>
        <Field label="PIN code"><input className="field" {...register("company.pinCode" as any)} /></Field>
      </div>
      <div className="border-t border-line pt-4">
        <h3 className="font-bold text-sm mb-3">Head office</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Branch name" error={eh.name?.message as string}><input className="field" {...register("headOffice.name" as any)} /></Field>
          <Field label="City"><input className="field" {...register("headOffice.city" as any)} /></Field>
          <Field label="State"><input className="field" {...register("headOffice.state" as any)} /></Field>
          <Field label="PIN code"><input className="field" {...register("headOffice.pinCode" as any)} /></Field>
          <Field label="Address" className="sm:col-span-2"><input className="field" {...register("headOffice.address" as any)} /></Field>
        </div>
      </div>
    </div>
  );
}
