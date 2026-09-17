import { inr } from "@/lib/utils";
import type { Pay } from "./types";
export function PayBreakdown({ p, compact }: { p: Pay; compact?: boolean }) {
  const Col = ({ t, rows }: { t: string; rows: { name: string; amount: number }[] }) => <div><div className="text-[12px] font-bold text-muted mb-1">{t}</div><dl className="divide-y divide-line/60">{rows.map((r, i) => <div key={i} className="flex justify-between py-1 text-sm"><dt>{r.name}</dt><dd className="tabular-nums">{inr(r.amount)}</dd></div>)}{!rows.length && <div className="py-1 text-sm text-muted">—</div>}</dl></div>;
  return (
    <div className={compact ? "space-y-3" : "grid gap-4 sm:grid-cols-2"}>
      <Col t="Earnings" rows={p.earnings} /><Col t="Deductions" rows={p.deductions} />
      <div className="sm:col-span-2 rounded-md bg-surface-2 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"><div><div className="text-xs text-muted">Gross</div><div className="font-bold tabular-nums">{inr(p.gross)}</div></div><div><div className="text-xs text-muted">Deductions</div><div className="font-bold tabular-nums">{inr(p.totalDeductions)}</div></div><div><div className="text-xs text-muted">Net pay</div><div className="font-extrabold tabular-nums text-brand">{inr(p.net)}</div></div><div><div className="text-xs text-muted">Employer cost (CTC)</div><div className="font-bold tabular-nums">{inr(p.employerCost)}</div></div></div>
      {p.employer.length > 0 && <p className="sm:col-span-2 text-xs text-muted">Employer contributions: {p.employer.map((e) => `${e.name} ${inr(e.amount)}`).join(" · ")}</p>}
    </div>
  );
}
