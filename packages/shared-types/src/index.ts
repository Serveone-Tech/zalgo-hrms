// Shared types & constants — frontend, backend, hardware-agent teeno yahi use karte hain.

export type ApiResponse<T = unknown> = {
  success: boolean;
  message: string;
  data?: T;
  code?: string;
  meta?: { page: number; limit: number; total: number };
};

// ----- User types -----
export const USER_TYPES = ["super_admin", "company_user"] as const;
export type UserType = (typeof USER_TYPES)[number];

// ----- Statuses -----
export const COMPANY_STATUS = ["trial", "active", "inactive", "suspended", "expired"] as const;
export type CompanyStatus = (typeof COMPANY_STATUS)[number];

export const SUBSCRIPTION_STATUS = [
  "trial", "active", "past_due", "pending_payment", "expired", "cancelled", "suspended",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

export const BRANCH_REQUEST_STATUS = [
  "draft", "pending", "under_review", "approved", "rejected", "cancelled",
] as const;
export type BranchRequestStatus = (typeof BRANCH_REQUEST_STATUS)[number];

export const BRANCH_STATUS = ["inactive", "active", "disabled"] as const;
export type BranchStatus = (typeof BRANCH_STATUS)[number];

// ----- Modules (subscription feature control) -----
export const MODULES = {
  employees: "Employee Management",
  attendance: "Attendance",
  leaves: "Leave",
  payroll: "Payroll",
  devices: "Hardware Devices",
  expenses: "Expenses",
  recruitment: "Recruitment",
  performance: "Performance",
  helpdesk: "Help Desk",
  reports: "Reports",
  analytics: "Advanced Analytics",
} as const;
export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

// ----- Permissions (resource.action) -----
export const PERMISSIONS = [
  "company.view", "company.update", "company.settings",
  "branch.view", "branch.request", "branch.update",
  "user.view", "user.create", "user.update", "user.delete",
  "role.view", "role.create", "role.update", "role.delete",
  "subscription.view",
  "employee.view", "employee.create", "employee.update", "employee.delete", "employee.export",
  "department.view", "department.manage",
  "designation.view", "designation.manage",
  "attendance.view", "attendance.create", "attendance.approve",
  "leave.view", "leave.apply", "leave.approve",
  "payroll.view", "payroll.process", "payroll.approve",
  "device.view", "device.manage",
  "report.view", "report.export",
  "audit.view",
  "expense.view", "expense.submit", "expense.approve", "expense.pay",
  "recruitment.view", "recruitment.manage",
  "performance.view", "performance.manage",
  "helpdesk.view", "helpdesk.manage",
  "announcement.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const DATA_SCOPES = ["own", "team", "department", "branch", "company"] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

// Default system roles seeded for every new company
export const DEFAULT_COMPANY_ROLES: Record<string, { scope: DataScope; permissions: Permission[] | "*" }> = {
  "Company Admin": { scope: "company", permissions: "*" },
  "Branch Admin": {
    scope: "branch",
    permissions: ["branch.view", "user.view", "employee.view", "employee.create", "employee.update",
      "department.view", "designation.view", "attendance.view", "attendance.approve", "leave.view",
      "leave.approve", "device.view", "report.view"],
  },
  "HR Manager": {
    scope: "company",
    permissions: ["employee.view", "employee.create", "employee.update", "employee.export",
      "department.view", "department.manage", "designation.view", "designation.manage",
      "attendance.view", "attendance.create", "attendance.approve", "leave.view", "leave.approve",
      "report.view", "report.export", "expense.view", "expense.approve", "recruitment.view", "recruitment.manage",
      "performance.view", "performance.manage", "helpdesk.view", "helpdesk.manage", "announcement.manage"],
  },
  "Recruiter": { scope: "company", permissions: ["recruitment.view", "recruitment.manage", "employee.view"] },
  "Accounts Manager": { scope: "company", permissions: ["expense.view", "expense.approve", "expense.pay", "payroll.view", "employee.view"] },
  "Payroll Manager": { scope: "company", permissions: ["employee.view", "attendance.view", "payroll.view", "payroll.process", "payroll.approve"] },
  "Department Manager": { scope: "department", permissions: ["employee.view", "attendance.view", "leave.view", "leave.approve", "expense.view", "expense.approve", "expense.submit", "performance.view", "performance.manage", "helpdesk.view"] },
  "Employee": { scope: "own", permissions: ["attendance.view", "leave.view", "leave.apply", "expense.submit", "performance.view", "helpdesk.view"] },
};

// ----- Auth payloads -----
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  type: UserType;
  companyId: string | null;
  branchId: string | null;
  roleName: string | null;
  permissions: Permission[] | "*";
  scope: DataScope;
  modules: ModuleKey[]; // enabled by subscription
  company?: { id: string; name: string; slug: string; status: CompanyStatus; logoUrl: string | null; onboardingStatus: OnboardingStatus } | null;
};

export const ONBOARDING_STATUS = ["signup", "profile", "plan", "payment", "active"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUS)[number];

export type LoginResponse = { user: AuthUser; accessToken: string; refreshToken: string };

// ----- Hardware agent contract -----
export type DeviceStatus = "online" | "offline" | "syncing" | "error" | "disabled";
export type RawPunch = { deviceSerial: string; deviceUserId: string; punchedAt: string; type?: "in" | "out" | "unknown" };
