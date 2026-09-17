import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/page";
import type { ApiResponse, LoginResponse } from "@hrms/shared-types";

const schema = z.object({
  ownerName: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").regex(/[A-Z]/, "Add an uppercase letter").regex(/[0-9]/, "Add a number"),
  mobile: z.string().optional(),
  companyName: z.string().min(2, "Enter your company name"),
  agreeTerms: z.boolean().refine((v) => v, "You must agree to the Terms"),
});
type Form = z.infer<typeof schema>;

export default function Signup() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { agreeTerms: false } });
  const [err, setErr] = useState<string | null>(null);
  const setSession = useAuth((s) => s.setSession);
  const nav = useNavigate();

  const onSubmit = async (v: Form) => {
    setErr(null);
    try {
      const { data } = await api.post<ApiResponse<LoginResponse>>("/auth/signup", v);
      setSession(data.data!);
      nav("/onboarding", { replace: true });
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between bg-side text-side-ink p-12">
        <Logo force="dark" className="h-10" />
        <div className="max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white">Set up your HR workspace in minutes.</h2>
          <p className="mt-4 text-side-ink/70 leading-relaxed">Create your company account, pick a plan, and start managing employees, attendance and payroll today.</p>
        </div>
        <div className="text-[12px] text-side-ink/50">© {new Date().getFullYear()} Zalgo Infotech Private Limited</div>
      </div>
      <div className="flex flex-col p-6 lg:p-12">
        <div className="flex items-center justify-between"><Logo className="lg:hidden" /><ThemeToggle className="ml-auto" /></div>
        <div className="m-auto w-full max-w-sm">
          <h1 className="text-2xl font-extrabold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted mt-1">Free trial, no card required to start.</p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
            <Field label="Your name" error={errors.ownerName?.message}><input className="field" autoComplete="name" {...register("ownerName")} /></Field>
            <Field label="Work email" error={errors.email?.message}><input className="field" type="email" autoComplete="email" {...register("email")} /></Field>
            <Field label="Mobile"><input className="field" autoComplete="tel" {...register("mobile")} /></Field>
            <Field label="Password" error={errors.password?.message}><input className="field" type="password" autoComplete="new-password" {...register("password")} /></Field>
            <Field label="Company name" error={errors.companyName?.message}><input className="field" {...register("companyName")} /></Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" {...register("agreeTerms")} />
              <span>I agree to the Terms of Service and Privacy Policy.</span>
            </label>
            {errors.agreeTerms && <p className="text-xs text-danger -mt-2">{errors.agreeTerms.message}</p>}
            {err && <p className="text-sm text-danger rounded-md bg-danger/10 px-3 py-2">{err}</p>}
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Create account</Button>
          </form>
          <p className="text-sm text-muted mt-6">Already have an account? <Link to="/login" className="text-brand font-semibold hover:underline">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
