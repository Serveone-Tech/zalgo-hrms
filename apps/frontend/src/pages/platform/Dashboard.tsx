import { Link } from "react-router-dom";
import { useGet } from "@/lib/queries";
import { PageHeader, Stat, Loading } from "@/components/ui/page";
import { inr } from "@/lib/utils";

type D = { totalCompanies: number; activeCompanies: number; trialCompanies: number; suspendedCompanies: number; totalBranches: number; totalUsers: number;
  pendingBranchRequests: number; expiringSoon: number; expired: number; monthlyRevenue: number; annualRevenue: number;
  signupsThisMonth: number; incompleteOnboardings: number;
  planDistribution: { plan: string; n: number }[]; companyGrowth: { month: string; n: number }[] };

export default function PlatformDashboard() {
  const { data, isLoading } = useGet<D>(["platform-dashboard"], "/platform/dashboard");
  if (isLoading || !data?.data) return <Loading />;
  const d = data.data;
  const max = Math.max(1, ...d.companyGrowth.map((g) => g.n));
  return (
    <>
      <PageHeader title="Platform overview" sub="Everything across all companies on Zalgo HRMS." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Monthly revenue" value={inr(d.monthlyRevenue)} hint={`${inr(d.annualRevenue)} annualised`} />
        <Stat label="Companies" value={d.totalCompanies} hint={`${d.activeCompanies} active · ${d.trialCompanies} trial · ${d.suspendedCompanies} suspended`} />
        <Stat label="Active branches" value={d.totalBranches} hint={`${d.totalUsers} company users`} />
        <Stat label="Pending branch requests" value={d.pendingBranchRequests} tone={d.pendingBranchRequests ? "warn" : undefined} hint="Need your approval" />
        <Stat label="Expiring in 7 days" value={d.expiringSoon} tone={d.expiringSoon ? "warn" : undefined} />
        <Stat label="Expired subscriptions" value={d.expired} tone={d.expired ? "danger" : undefined} />
        <Stat label="Signups this month" value={d.signupsThisMonth} />
        <Stat label="Incomplete onboardings" value={d.incompleteOnboardings} tone={d.incompleteOnboardings ? "warn" : undefined} hint="Stuck mid-signup" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 mt-6">
        <div className="card p-5">
          <h3 className="font-bold">Company growth</h3>
          <div className="mt-4 flex items-end gap-2 h-36">
            {d.companyGrowth.length === 0 && <p className="text-sm text-muted">No companies yet.</p>}
            {d.companyGrowth.map((g) => (
              <div key={g.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full rounded-t bg-brand" style={{ height: `${(g.n / max) * 100}%` }} title={`${g.n}`} />
                <span className="text-[10px] text-muted truncate">{g.month.slice(2)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-bold">Plan distribution</h3>
          <ul className="mt-3 divide-y divide-line">
            {d.planDistribution.map((p) => <li key={p.plan} className="flex justify-between py-2 text-sm"><span>{p.plan}</span><span className="font-semibold tabular-nums">{p.n}</span></li>)}
            {d.planDistribution.length === 0 && <li className="py-2 text-sm text-muted">No subscriptions yet.</li>}
          </ul>
          <Link to="/platform/companies" className="inline-block mt-4 text-sm font-semibold text-brand">Manage companies</Link>
        </div>
      </div>
    </>
  );
}
