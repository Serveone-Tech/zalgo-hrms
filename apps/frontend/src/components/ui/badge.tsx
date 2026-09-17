import { cn } from "@/lib/utils";
const tone: Record<string, string> = {
  active: "bg-good/12 text-good", approved: "bg-good/12 text-good", paid: "bg-good/12 text-good", online: "bg-good/12 text-good",
  trial: "bg-brand-soft text-brand", under_review: "bg-brand-soft text-brand",
  pending: "bg-warn/12 text-warn", past_due: "bg-warn/12 text-warn", pending_payment: "bg-warn/12 text-warn", expiring: "bg-warn/12 text-warn",
  suspended: "bg-danger/12 text-danger", rejected: "bg-danger/12 text-danger", expired: "bg-danger/12 text-danger", cancelled: "bg-danger/12 text-danger", offline: "bg-danger/12 text-danger",
  inactive: "bg-surface-2 text-muted", disabled: "bg-surface-2 text-muted", draft: "bg-surface-2 text-muted",
};
export function Badge({ status, children, className }: { status?: string; children?: React.ReactNode; className?: string }) {
  const s = (status ?? "").toLowerCase();
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize", tone[s] ?? "bg-surface-2 text-ink", className)}>{children ?? s.replace(/_/g, " ")}</span>;
}
