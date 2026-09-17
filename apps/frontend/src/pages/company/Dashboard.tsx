import { Link } from "react-router-dom";
import { useGet } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Stat, Loading } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { daysLeft, fmtDate } from "@/lib/utils";

type Ann = { id: string; title: string; body: string; priority: string; publishAt: string; isPinned: boolean };

type D = { pendingLeaves: number; devicesOnline: number; devicesTotal: number; activeBranches: number; pendingBranches: number; totalUsers: number; totalEmployees: number; expiringDocs: number; byDepartment: { name: string; n: number }[]; presentToday: number; absentToday: number; lateToday: number; onLeaveToday: number;
  subscription: null | { status: string; endsAt: string; employeeLimit: number; branchLimit: number; deviceLimit: number; plan: string; modules: string[] } };

export default function CompanyDashboard() {
  const user = useAuth((s) => s.user);
  const { data, isLoading } = useGet<D>(["company-dashboard"], "/company/dashboard");
  const ann = useGet<Ann[]>(["ann", false], "/announcements");
  if (isLoading || !data?.data) return <Loading />;
  const d = data.data; const s = d.subscription; const left = daysLeft(s?.endsAt);
  return (
    <>
      <PageHeader title={`Hello, ${user?.name?.split(" ")[0]}`} sub={`${user?.company?.name} · ${user?.roleName}`} />
      {s && left <= 7 && (
        <div className={`mb-5 rounded-lg border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2 ${left <= 0 ? "border-danger/40 bg-danger/10" : "border-warn/40 bg-warn/10"}`}>
          <span>{left <= 0 ? "Your subscription has expired." : `Your subscription ends in ${left} day${left === 1 ? "" : "s"} (${fmtDate(s.endsAt)}).`} Contact Zalgo Infotech to renew.</span>
          <Link to="/app/subscription" className="font-semibold text-brand">View subscription</Link>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Employees" value={d.totalEmployees} hint={`of ${s?.employeeLimit ?? 0} in plan`} tone={s && d.totalEmployees >= s.employeeLimit ? "warn" : undefined} />
        <Stat label="Present today" value={d.presentToday} hint={`${d.absentToday} absent · ${d.lateToday} late · ${d.onLeaveToday} on leave`} tone="good" />
        <Stat label="Pending leave requests" value={d.pendingLeaves} tone={d.pendingLeaves ? "warn" : undefined} hint="Awaiting approval" />
        <Stat label="Active branches" value={d.activeBranches} hint={d.pendingBranches ? `${d.pendingBranches} awaiting approval` : `of ${s?.branchLimit ?? 0} in plan`} tone={d.pendingBranches ? "warn" : undefined} />
        <Stat label="Devices online" value={`${d.devicesOnline} / ${d.devicesTotal}`} hint={d.expiringDocs ? `${d.expiringDocs} documents expiring soon` : "Biometric & face devices"} tone={d.devicesTotal && d.devicesOnline < d.devicesTotal ? "warn" : undefined} />
      </div>
      {d.byDepartment.length > 0 && <div className="card p-5 mt-6"><h3 className="font-bold">Headcount by department</h3><ul className="mt-3 space-y-2">{d.byDepartment.map((x) => <li key={x.name} className="text-sm"><div className="flex justify-between"><span>{x.name}</span><span className="font-semibold tabular-nums">{x.n}</span></div><div className="h-1.5 rounded bg-surface-2 mt-1"><div className="h-full rounded bg-brand" style={{ width: `${(x.n / Math.max(1, d.totalEmployees)) * 100}%` }} /></div></li>)}</ul></div>}
      {ann.data?.data?.length ? <div className="card p-5 mt-6"><div className="flex items-center justify-between"><h3 className="font-bold">Announcements</h3><Link to="/app/announcements" className="text-sm font-semibold text-brand">All</Link></div><ul className="mt-3 divide-y divide-line">{ann.data.data.slice(0, 3).map((a) => <li key={a.id} className="py-2"><div className="font-semibold text-sm">{a.isPinned ? "📌 " : ""}{a.title}</div><div className="text-sm text-muted line-clamp-2">{a.body}</div><div className="text-xs text-muted mt-0.5">{fmtDate(a.publishAt)}</div></li>)}</ul></div> : null}
      <div className="card p-5 mt-6 flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-bold">{s?.plan ?? "No plan"} plan <Badge status={s?.status ?? "inactive"} className="ml-2" /></div><div className="text-sm text-muted mt-0.5">Renews {fmtDate(s?.endsAt)} · {s?.modules.length ?? 0} modules enabled</div></div>
        <Link to="/app/subscription" className="text-sm font-semibold text-brand">Manage</Link>
      </div>
    </>
  );
}
