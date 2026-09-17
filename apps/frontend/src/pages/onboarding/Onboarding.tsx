import { Navigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useGet } from "@/lib/queries";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loading } from "@/components/ui/page";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import { ProfileStep } from "./steps/ProfileStep";
import { PlanStep } from "./steps/PlanStep";
import { PaymentStep } from "./steps/PaymentStep";
import type { StatusResponse } from "./onboarding.types";

const STEPS = [{ label: "Company profile" }, { label: "Choose plan" }, { label: "Payment" }];
const stepIndex = (status: StatusResponse["onboardingStatus"]) => (status === "plan" ? 1 : status === "payment" ? 2 : 0);

export default function Onboarding() {
  const { user } = useAuth();
  const { data, isLoading } = useGet<StatusResponse>(["onboarding-status"], "/onboarding/status", user?.type === "company_user");

  if (user?.type !== "company_user") return <Navigate to="/login" replace />;
  if (isLoading || !data?.data) return <Loading />;
  const s = data.data;
  if (s.onboardingStatus === "active") return <Navigate to="/app" replace />;
  const idx = stepIndex(s.onboardingStatus);

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line px-6 py-4 flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </header>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <ol className="flex items-center gap-2 mb-8 flex-wrap">
          {STEPS.map((st, i) => (
            <li key={st.label} className={cn("flex items-center gap-2 text-sm font-semibold", i === idx ? "text-brand" : i < idx ? "text-good" : "text-muted")}>
              <span className={cn("h-6 w-6 rounded-full grid place-items-center text-xs border shrink-0", i <= idx ? "border-brand bg-brand text-brand-ink" : "border-line")}>
                {i < idx ? <CheckCircle2 size={14} /> : i + 1}
              </span>
              {st.label}
              {i < STEPS.length - 1 && <span className="w-8 h-px bg-line mx-1" />}
            </li>
          ))}
        </ol>
        {idx === 0 && <ProfileStep status={s} />}
        {idx === 1 && <PlanStep status={s} />}
        {idx === 2 && <PaymentStep status={s} />}
      </div>
    </div>
  );
}
