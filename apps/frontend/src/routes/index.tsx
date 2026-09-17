import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { AppLayout } from "@/layouts/AppLayout";
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import Onboarding from "@/pages/onboarding/Onboarding";
import Terms from "@/pages/legal/Terms";
import Privacy from "@/pages/legal/Privacy";
import PlatformDashboard from "@/pages/platform/Dashboard";
import Companies from "@/pages/platform/Companies";
import CompanyDetail from "@/pages/platform/CompanyDetail";
import Plans from "@/pages/platform/Plans";
import BranchRequests from "@/pages/platform/BranchRequests";
import AuditLogs from "@/pages/platform/AuditLogs";
import Addons from "@/pages/platform/Addons";
import Invoices from "@/pages/platform/Invoices";
import Payments from "@/pages/platform/Payments";
import CompanyDashboard from "@/pages/company/Dashboard";
import Branches from "@/pages/company/Branches";
import UsersPage from "@/pages/company/Users";
import Roles from "@/pages/company/Roles";
import Subscription from "@/pages/company/Subscription";
import SettingsPage from "@/pages/company/Settings";
import Employees from "@/pages/company/employees/Employees";
import EmployeeProfile from "@/pages/company/employees/EmployeeProfile";
import { Departments, Designations } from "@/pages/company/employees/Departments";
import OrgTree from "@/pages/company/employees/OrgTree";
import Shifts from "@/pages/company/attendance/Shifts";
import Attendance from "@/pages/company/attendance/Attendance";
import MyAttendance from "@/pages/company/attendance/MyAttendance";
import Devices from "@/pages/company/Devices";
import Leaves from "@/pages/company/leaves/Leaves";
import Payroll from "@/pages/company/payroll/Payroll";
import MyPayslips from "@/pages/company/payroll/MyPayslips";
import Expenses from "@/pages/company/hr/Expenses";
import Recruitment from "@/pages/company/hr/Recruitment";
import Performance from "@/pages/company/hr/Performance";
import Helpdesk from "@/pages/company/hr/Helpdesk";
import Announcements from "@/pages/company/hr/Announcements";
import CalendarPage from "@/pages/company/hr/Calendar";
import Automation from "@/pages/company/system/Automation";
import Reports from "@/pages/company/system/Reports";
import Assistant from "@/pages/company/system/Assistant";
import type { ReactElement } from "react";

function Guard({ children, type }: { children: ReactElement; type?: "super_admin" | "company_user" }) {
  const { user } = useAuth(); const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (type && user.type !== type) return <Navigate to={user.type === "super_admin" ? "/platform" : "/app"} replace />;
  if (user.type === "company_user" && user.company?.onboardingStatus && user.company.onboardingStatus !== "active") return <Navigate to="/onboarding" replace />;
  return children;
}

export function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.type === "super_admin" ? "/platform" : "/app"} replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to={user.type === "super_admin" ? "/platform" : "/app"} replace /> : <Signup />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/platform" element={<Guard type="super_admin"><AppLayout /></Guard>}>
        <Route index element={<PlatformDashboard />} />
        <Route path="companies" element={<Companies />} />
        <Route path="companies/:id" element={<CompanyDetail />} />
        <Route path="plans" element={<Plans />} />
        <Route path="branch-requests" element={<BranchRequests />} />
        <Route path="addons" element={<Addons />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="payments" element={<Payments />} />
        <Route path="audit-logs" element={<AuditLogs />} />
      </Route>
      <Route path="/app" element={<Guard type="company_user"><AppLayout /></Guard>}>
        <Route index element={<CompanyDashboard />} />
        <Route path="branches" element={<Branches />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="roles" element={<Roles />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="employees" element={<Employees />} />
        <Route path="employees/:id" element={<EmployeeProfile />} />
        <Route path="departments" element={<Departments />} />
        <Route path="designations" element={<Designations />} />
        <Route path="org" element={<OrgTree />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="attendance/me" element={<MyAttendance />} />
        <Route path="shifts" element={<Shifts />} />
        <Route path="devices" element={<Devices />} />
        <Route path="leaves" element={<Leaves />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="payroll/me" element={<MyPayslips />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="recruitment" element={<Recruitment />} />
        <Route path="performance" element={<Performance />} />
        <Route path="helpdesk" element={<Helpdesk />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="reports" element={<Reports />} />
        <Route path="automation" element={<Automation />} />
        <Route path="assistant" element={<Assistant />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? (user.type === "super_admin" ? "/platform" : "/app") : "/login"} replace />} />
    </Routes>
  );
}
