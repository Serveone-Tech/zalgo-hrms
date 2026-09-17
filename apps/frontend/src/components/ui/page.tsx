import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div><h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>{sub && <p className="text-sm text-muted mt-1">{sub}</p>}</div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "warn" | "danger" | "good" }) {
  return (
    <div className="card p-4">
      <div className="text-[13px] font-semibold text-muted">{label}</div>
      <div className={cn("text-2xl font-extrabold mt-1 tabular-nums", tone === "warn" && "text-warn", tone === "danger" && "text-danger", tone === "good" && "text-good")}>{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
  );
}
export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return <div className="card p-10 text-center text-sm text-muted"><p>{text}</p>{action && <div className="mt-3">{action}</div>}</div>;
}
export function Field({ label, error, children, className }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return <div className={className}><label className="label">{label}</label>{children}{error && <p className="text-xs text-danger mt-1">{error}</p>}</div>;
}
export const Loading = () => <div className="p-10 text-center text-sm text-muted">Loading…</div>;
