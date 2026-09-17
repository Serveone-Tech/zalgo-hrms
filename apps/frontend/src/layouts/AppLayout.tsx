import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard, Building2, CreditCard, Layers, GitPullRequest, ScrollText, Settings, LogOut, Menu, X, PackagePlus, Receipt,
  MapPin, Users, ShieldCheck, UserSquare2, CalendarClock, CalendarDays, Wallet, Cpu, BarChart3, Lock, Network, Briefcase, Award, ReceiptIndianRupee, UserPlus, Target, LifeBuoy, Megaphone, Calendar, Zap, Sparkles,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/lib/socket";
import type { ModuleKey, Permission } from "@hrms/shared-types";

type Item = { to: string; label: string; icon: typeof LayoutDashboard; perm?: Permission; module?: ModuleKey; soon?: boolean };

const platformNav: Item[] = [
  { to: "/platform", label: "Dashboard", icon: LayoutDashboard },
  { to: "/platform/companies", label: "Companies", icon: Building2 },
  { to: "/platform/plans", label: "Subscription plans", icon: Layers },
  { to: "/platform/branch-requests", label: "Branch requests", icon: GitPullRequest },
  { to: "/platform/addons", label: "Add-ons", icon: PackagePlus },
  { to: "/platform/invoices", label: "Invoices", icon: Receipt },
  { to: "/platform/payments", label: "Payments", icon: CreditCard },
  { to: "/platform/audit-logs", label: "Audit logs", icon: ScrollText },
];
const companyNav: Item[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/branches", label: "Branches", icon: MapPin, perm: "branch.view" },
  { to: "/app/users", label: "Users", icon: Users, perm: "user.view" },
  { to: "/app/roles", label: "Roles & permissions", icon: ShieldCheck, perm: "role.view" },
  { to: "/app/employees", label: "Employees", icon: UserSquare2, module: "employees", perm: "employee.view" },
  { to: "/app/departments", label: "Departments", icon: Briefcase, module: "employees", perm: "department.view" },
  { to: "/app/designations", label: "Designations", icon: Award, module: "employees", perm: "designation.view" },
  { to: "/app/org", label: "Organization", icon: Network, module: "employees", perm: "employee.view" },
  { to: "/app/attendance/me", label: "My attendance", icon: CalendarClock, module: "attendance" },
  { to: "/app/attendance", label: "Attendance", icon: CalendarClock, module: "attendance", perm: "attendance.view" },
  { to: "/app/shifts", label: "Shifts & holidays", icon: CalendarDays, module: "attendance", perm: "attendance.view" },
  { to: "/app/leaves", label: "Leave", icon: CalendarDays, module: "leaves" },
  { to: "/app/payroll/me", label: "My payslips", icon: Wallet, module: "payroll" },
  { to: "/app/payroll", label: "Payroll", icon: Wallet, module: "payroll", perm: "payroll.view" },
  { to: "/app/devices", label: "Devices", icon: Cpu, module: "devices", perm: "device.view" },
  { to: "/app/expenses", label: "Expenses", icon: ReceiptIndianRupee, module: "expenses" },
  { to: "/app/recruitment", label: "Recruitment", icon: UserPlus, module: "recruitment", perm: "recruitment.view" },
  { to: "/app/performance", label: "Performance", icon: Target, module: "performance" },
  { to: "/app/helpdesk", label: "Help desk", icon: LifeBuoy, module: "helpdesk" },
  { to: "/app/announcements", label: "Announcements", icon: Megaphone },
  { to: "/app/calendar", label: "Calendar", icon: Calendar },
  { to: "/app/reports", label: "Reports", icon: BarChart3, module: "reports", perm: "report.view" },
  { to: "/app/assistant", label: "HR assistant", icon: Sparkles, module: "analytics" },
  { to: "/app/automation", label: "Automation", icon: Zap, perm: "company.settings" },
  { to: "/app/subscription", label: "Subscription", icon: CreditCard, perm: "subscription.view" },
  { to: "/app/settings", label: "Settings", icon: Settings, perm: "company.view" },
];

export function AppLayout() {
  const { user, logout, can, hasModule } = useAuth();
  useRealtime();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const isPlatform = user?.type === "super_admin";
  const items = (isPlatform ? platformNav : companyNav).filter((i) => !i.perm || can(i.perm));

  const Side = (
    <aside className="flex h-full w-64 flex-col bg-side text-side-ink">
      <div className="h-16 flex items-center justify-between px-5 border-b border-white/10">
        <Logo force="dark" />
        <button className="lg:hidden text-side-ink/70" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
      </div>
      <div className="px-5 py-3 border-b border-white/10 text-[12px]">
        {isPlatform ? <span className="font-semibold text-side-ink">Platform · Super Admin</span> : (
          <div className="min-w-0">
            <div className="font-semibold truncate">{user?.company?.name}</div>
            <div className="text-side-ink/60 truncate">{user?.roleName}</div>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {items.map((i) => {
          const locked = i.module && !hasModule(i.module);
          return (
            <NavLink key={i.to} to={locked ? "/app/subscription" : i.to} end={i.to === "/platform" || i.to === "/app" || i.to === "/app/attendance" || i.to === "/app/payroll"} onClick={() => setOpen(false)}
              className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors",
                isActive && !locked ? "bg-white/10 text-white" : "text-side-ink/70 hover:bg-white/5 hover:text-side-ink", locked && "opacity-60")}>
              <i.icon size={17} className="shrink-0" />
              <span className="flex-1 truncate">{i.label}</span>
              {locked ? <Lock size={13} /> : null}
            </NavLink>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/10">
        <button onClick={() => { logout(); nav("/login"); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13.5px] text-side-ink/70 hover:bg-white/5 hover:text-side-ink">
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:block sticky top-0 h-screen">{Side}</div>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><div className="relative h-full">{Side}</div></div>}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 sticky top-0 z-30 flex items-center justify-between gap-3 px-4 lg:px-8 bg-bg/85 backdrop-blur border-b border-line">
          <button className="lg:hidden text-ink" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="hidden lg:block text-sm text-muted">Saturday, {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {!isPlatform && <NotificationBell />}
            <div className="h-9 w-9 rounded-full bg-brand-soft text-brand grid place-items-center text-sm font-bold" title={user?.email}>{user?.name?.[0]?.toUpperCase()}</div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto"><Outlet /></main>
      </div>
    </div>
  );
}
