import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { CompanyProfileForm } from "@/components/company/CompanyProfileForm";
import { LogoUploader } from "@/components/company/LogoUploader";
import { companyProfileSchema, headOfficeSchema } from "@/lib/companySchema";
import type { StatusResponse } from "../onboarding.types";

const schema = z.object({ company: companyProfileSchema, headOffice: headOfficeSchema });
type Form = z.infer<typeof schema>;

export function ProfileStep({ status }: { status: StatusResponse }) {
  const qc = useQueryClient();
  const act = useAction<Form>([["onboarding-status"]]);
  const c = status.company; const ho = status.headOffice;
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      company: {
        name: c.name, slug: c.slug, industry: c.industry ?? "", companySize: (c.companySize ?? "") as Form["company"]["companySize"],
        email: c.email ?? "", mobile: c.mobile ?? "", website: c.website ?? "", gstNumber: c.gstNumber ?? "", panNumber: c.panNumber ?? "",
        address: c.address ?? "", country: c.country, state: c.state ?? "", city: c.city ?? "", pinCode: c.pinCode ?? "", timezone: c.timezone,
      },
      headOffice: { name: ho?.name ?? "Head Office", address: ho?.address ?? "", city: ho?.city ?? "", state: ho?.state ?? "", pinCode: ho?.pinCode ?? "" },
    },
  });

  return (
    <div className="card p-6">
      <h2 className="text-lg font-bold">Tell us about your company</h2>
      <p className="text-sm text-muted mt-1">This appears on payslips, letters and reports.</p>
      <div className="mt-5 mb-2">
        <LogoUploader logoUrl={status.company.logoUrl} uploadUrl="/onboarding/logo" onUploaded={() => qc.invalidateQueries({ queryKey: ["onboarding-status"] })} />
      </div>
      <form className="mt-5" noValidate onSubmit={handleSubmit((v) => act.mutate({ method: "put", url: "/onboarding/profile", body: v }))}>
        <CompanyProfileForm register={register} errors={errors} setValue={setValue} />
        <div className="flex justify-end mt-6"><Button type="submit" size="lg" loading={act.isPending}>Continue</Button></div>
      </form>
    </div>
  );
}
