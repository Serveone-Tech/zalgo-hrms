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

const schema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Password is required") });
type Form = z.infer<typeof schema>;

export default function Login() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });
  const [err, setErr] = useState<string | null>(null);
  const setSession = useAuth((s) => s.setSession);
  const nav = useNavigate();

  const onSubmit = async (v: Form) => {
    setErr(null);
    try {
      const { data } = await api.post<ApiResponse<LoginResponse>>("/auth/login", v);
      setSession(data.data!);
      const user = data.data!.user;
      if (user.type === "company_user" && user.company?.onboardingStatus && user.company.onboardingStatus !== "active") nav("/onboarding", { replace: true });
      else nav(user.type === "super_admin" ? "/platform" : "/app", { replace: true });
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between bg-side text-side-ink p-12">
        <Logo force="dark" className="h-10 self-start" />
        <div className="max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white">One workspace for every company, every branch, every punch.</h2>
          <p className="mt-4 text-side-ink/70 leading-relaxed">Multi-tenant HR platform with subscription plans, branch approvals, biometric devices and payroll — built by Zalgo Infotech.</p>
        </div>
        <div className="text-[12px] text-side-ink/50">© {new Date().getFullYear()} Zalgo Infotech Private Limited</div>
      </div>
      <div className="flex flex-col p-6 lg:p-12">
        <div className="flex items-center justify-between"><Logo className="lg:hidden" /><ThemeToggle className="ml-auto" /></div>
        <div className="m-auto w-full max-w-sm">
          <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted mt-1">Use your company or platform account.</p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
            <Field label="Email" error={errors.email?.message}><input className="field" type="email" autoComplete="email" {...register("email")} /></Field>
            <Field label="Password" error={errors.password?.message}><input className="field" type="password" autoComplete="current-password" {...register("password")} /></Field>
            {err && <p className="text-sm text-danger rounded-md bg-danger/10 px-3 py-2">{err}</p>}
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Sign in</Button>
          </form>
          <p className="text-sm text-muted mt-6">New here? <Link to="/signup" className="text-brand font-semibold hover:underline">Create your company account</Link></p>
        </div>
      </div>
    </div>
  );
}
