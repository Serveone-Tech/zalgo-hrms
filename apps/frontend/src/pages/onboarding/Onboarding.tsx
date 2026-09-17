import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useGet } from "@/lib/queries";
import { api } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loading } from "@/components/ui/page";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import { ProfileStep } from "./steps/ProfileStep";
import { PlanStep } from "./steps/PlanStep";
import { PaymentStep } from "./steps/PaymentStep";
import type { StatusResponse } from "./onboarding.types";
import type { ApiResponse, AuthUser } from "@hrms/shared-types";

const STEPS = [{ label: "Company profile" }, { label: "Choose plan" }, { label: "Payment" }];
const stepIndex = (status: StatusResponse["onboardingStatus"]) => (status === "plan" ? 1 : status === "payment" ? 2 : 0);

export default function Onboarding() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const { data, isLoading } = useGet<StatusResponse>(["onboarding-status"], "/onboarding/status", user?.type === "company_user");
  // null = follow the server's furthest step; a number = user clicked "Back" to review/edit an earlier step.
  const [viewStep, setViewStep] = useState<number | null>(null);
  const s = data?.data;

  // The auth store's user.company.onboardingStatus is cached from login/signup and never
  // updates on its own — without refreshing it first, the /app route guard bounces straight
  // back here even after the server has moved onboardingStatus to "active".
  useEffect(() => {
    if (s?.onboardingStatus !== "active") return;
    api.get<ApiResponse<AuthUser>>("/auth/me").then(({ data }) => {
      setUser(data.data!);
      nav("/app", { replace: true });
    });
  }, [s?.onboardingStatus, nav, setUser]);

  if (user?.type !== "company_user") return <Navigate to="/login" replace />;
  if (isLoading || !s) return <Loading />;
  if (s.onboardingStatus === "active") return <Loading />; // redirect effect above is in flight

  const serverIdx = stepIndex(s.onboardingStatus);
  const idx = viewStep ?? serverIdx;
  const goToStep = (i: number) => setViewStep(i);
  const resumeServerStep = () => setViewStep(null);

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line px-6 py-4 flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </header>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <ol className="flex items-center gap-2 mb-8 flex-wrap">
          {STEPS.map((st, i) => (
            <li key={st.label} className="flex items-center gap-2">
              <button type="button" disabled={i > serverIdx} onClick={() => i <= serverIdx && goToStep(i)}
                className={cn("flex items-center gap-2 text-sm font-semibold", i > serverIdx && "cursor-not-allowed",
                  i === idx ? "text-brand" : i < serverIdx ? "text-good" : "text-muted")}>
                <span className={cn("h-6 w-6 rounded-full grid place-items-center text-xs border shrink-0", i <= serverIdx ? "border-brand bg-brand text-brand-ink" : "border-line")}>
                  {i < serverIdx ? <CheckCircle2 size={14} /> : i + 1}
                </span>
                {st.label}
              </button>
              {i < STEPS.length - 1 && <span className="w-8 h-px bg-line mx-1" />}
            </li>
          ))}
        </ol>
        {idx === 0 && <ProfileStep status={s} onSaved={resumeServerStep} />}
        {idx === 1 && <PlanStep status={s} onBack={() => goToStep(0)} onAdvance={resumeServerStep} />}
        {idx === 2 && <PaymentStep status={s} onBack={() => goToStep(1)} />}
      </div>
    </div>
  );
}
