// Multi-tenant schema. Rule: har company-related table mein company_id hota hai.
import {
  pgTable, uuid, text, varchar, timestamp, boolean, integer, numeric, jsonb, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userTypeEnum = pgEnum("user_type", ["super_admin", "company_user"]);
export const companyStatusEnum = pgEnum("company_status", ["trial", "active", "inactive", "suspended", "expired"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trial", "active", "past_due", "pending_payment", "expired", "cancelled", "suspended"]);
export const branchStatusEnum = pgEnum("branch_status", ["inactive", "active", "disabled"]);
export const branchRequestStatusEnum = pgEnum("branch_request_status", ["draft", "pending", "under_review", "approved", "rejected", "cancelled"]);
export const dataScopeEnum = pgEnum("data_scope", ["own", "team", "department", "branch", "company"]);
export const onboardingStatusEnum = pgEnum("onboarding_status", ["signup", "profile", "plan", "payment", "active"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

// ---------- Platform ----------
export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  monthlyPrice: numeric("monthly_price", { precision: 12, scale: 2 }).notNull().default("0"),
  yearlyPrice: numeric("yearly_price", { precision: 12, scale: 2 }).notNull().default("0"),
  trialDays: integer("trial_days").notNull().default(14),
  isPublic: boolean("is_public").notNull().default(true), // false = hidden from self-signup, Super Admin can still assign
  badge: varchar("badge", { length: 30 }), // e.g. "Most popular"
  includedEmployees: integer("included_employees").notNull().default(10),
  includedBranches: integer("included_branches").notNull().default(1),
  includedDevices: integer("included_devices").notNull().default(1),
  includedStorageMb: integer("included_storage_mb").notNull().default(1024),
  additionalBranchPrice: numeric("additional_branch_price", { precision: 12, scale: 2 }).notNull().default("0"),
  additionalEmployeePrice: numeric("additional_employee_price", { precision: 12, scale: 2 }).notNull().default("0"),
  additionalDevicePrice: numeric("additional_device_price", { precision: 12, scale: 2 }).notNull().default("0"),
  modules: jsonb("modules").$type<string[]>().notNull().default([]),
  // Fine-grained attendance capabilities gated per-plan (Section 35): "selfCheckin" | "gps" |
  // "selfie" | "activityTracking" | "autoInactivityPause" | "desktopAgent"
  attendanceFeatures: jsonb("attendance_features").$type<string[]>().notNull().default(["selfCheckin"]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  code: varchar("code", { length: 50 }),
  logoUrl: text("logo_url"),
  email: varchar("email", { length: 200 }),
  mobile: varchar("mobile", { length: 30 }),
  website: varchar("website", { length: 200 }),
  gstNumber: varchar("gst_number", { length: 30 }),
  panNumber: varchar("pan_number", { length: 20 }),
  address: text("address"),
  country: varchar("country", { length: 100 }).default("India"),
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),
  pinCode: varchar("pin_code", { length: 12 }),
  timezone: varchar("timezone", { length: 60 }).notNull().default("Asia/Kolkata"),
  status: companyStatusEnum("status").notNull().default("trial"),
  agentKey: varchar("agent_key", { length: 80 }), // hardware agent auth (Phase 5)
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  onboardingStatus: onboardingStatusEnum("onboarding_status").notNull().default("active"),
  ownerUserId: uuid("owner_user_id"), // self-signup owner (nullable — Super Admin created companies may not set this)
  industry: varchar("industry", { length: 80 }),
  companySize: varchar("company_size", { length: 20 }), // "1-10" | "11-50" | "51-200" | "201-500" | "500+"
  source: varchar("source", { length: 40 }), // how they heard about us
  ...timestamps,
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => subscriptionPlans.id),
  status: subscriptionStatusEnum("status").notNull().default("trial"),
  billingCycle: varchar("billing_cycle", { length: 10 }).notNull().default("monthly"),
  employeeLimit: integer("employee_limit").notNull(),
  branchLimit: integer("branch_limit").notNull(),
  deviceLimit: integer("device_limit").notNull(),
  modules: jsonb("modules").$type<string[]>().notNull().default([]),
  attendanceFeatures: jsonb("attendance_features").$type<string[]>().notNull().default(["selfCheckin"]),
  basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull().default("0"),
  additionalBranchTotal: numeric("additional_branch_total", { precision: 12, scale: 2 }).notNull().default("0"),
  additionalEmployeeTotal: numeric("additional_employee_total", { precision: 12, scale: 2 }).notNull().default("0"),
  additionalDeviceTotal: numeric("additional_device_total", { precision: 12, scale: 2 }).notNull().default("0"),
  addonsTotal: numeric("addons_total", { precision: 12, scale: 2 }).notNull().default("0"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  gracePeriodDays: integer("grace_period_days").notNull().default(7),
  ...timestamps,
}, (t) => [index("subscriptions_company_idx").on(t.companyId)]);

export const subscriptionHistory = pgTable("subscription_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  action: varchar("action", { length: 50 }).notNull(),
  previousPlanId: uuid("previous_plan_id"),
  newPlanId: uuid("new_plan_id"),
  note: text("note"),
  changedBy: uuid("changed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Tenant ----------
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  scope: dataScopeEnum("scope").notNull().default("own"),
  permissions: jsonb("permissions").$type<string[] | "*">().notNull().default([]),
  isSystem: boolean("is_system").notNull().default(false),
  ...timestamps,
}, (t) => [uniqueIndex("roles_company_name_idx").on(t.companyId, t.name)]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id"),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
  type: userTypeEnum("type").notNull().default("company_user"),
  name: varchar("name", { length: 150 }).notNull(),
  email: varchar("email", { length: 200 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_company_idx").on(t.companyId)]);

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  userAgent: text("user_agent"),
  ip: varchar("ip", { length: 60 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("refresh_tokens_user_idx").on(t.userId)]);

export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 150 }).notNull(),
  code: varchar("code", { length: 50 }),
  isHeadOffice: boolean("is_head_office").notNull().default(false),
  address: text("address"),
  country: varchar("country", { length: 100 }).default("India"),
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),
  pinCode: varchar("pin_code", { length: 12 }),
  timezone: varchar("timezone", { length: 60 }).notNull().default("Asia/Kolkata"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  geofenceRadiusM: integer("geofence_radius_m"),
  status: branchStatusEnum("status").notNull().default("inactive"),
  approvedPrice: numeric("approved_price", { precision: 12, scale: 2 }).default("0"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}), // per-branch attendance overrides — falls back to company settings.attendance when absent
  ...timestamps,
}, (t) => [index("branches_company_idx").on(t.companyId)]);

export const branchRequests = pgTable("branch_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  name: varchar("name", { length: 150 }).notNull(),
  code: varchar("code", { length: 50 }),
  address: text("address"),
  country: varchar("country", { length: 100 }).default("India"),
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),
  pinCode: varchar("pin_code", { length: 12 }),
  expectedEmployees: integer("expected_employees").default(0),
  expectedDevices: integer("expected_devices").default(0),
  reason: text("reason"),
  branchType: varchar("branch_type", { length: 50 }),
  expectedOpeningDate: timestamp("expected_opening_date", { withTimezone: true }),
  status: branchRequestStatusEnum("status").notNull().default("pending"),
  defaultPrice: numeric("default_price", { precision: 12, scale: 2 }).default("0"),
  approvedPrice: numeric("approved_price", { precision: 12, scale: 2 }),
  rejectionReason: text("rejection_reason"),
  requestedBy: uuid("requested_by"),
  reviewedBy: uuid("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("branch_requests_company_idx").on(t.companyId)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id"),
  userId: uuid("user_id"),
  userName: varchar("user_name", { length: 150 }),
  action: varchar("action", { length: 60 }).notNull(),
  entity: varchar("entity", { length: 60 }).notNull(),
  entityId: varchar("entity_id", { length: 80 }),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ip: varchar("ip", { length: 60 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("audit_logs_company_idx").on(t.companyId), index("audit_logs_created_idx").on(t.createdAt)]);

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users), branches: many(branches), subscriptions: many(subscriptions), roles: many(roles),
}));
export const usersRelations = relations(users, ({ one }) => ({
  company: one(companies, { fields: [users.companyId], references: [companies.id] }),
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
}));
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  company: one(companies, { fields: [subscriptions.companyId], references: [companies.id] }),
  plan: one(subscriptionPlans, { fields: [subscriptions.planId], references: [subscriptionPlans.id] }),
}));
export const branchesRelations = relations(branches, ({ one }) => ({
  company: one(companies, { fields: [branches.companyId], references: [companies.id] }),
}));

// ---------- Phase 2: Add-ons & Invoices ----------
export const subscriptionAddons = pgTable("subscription_addons", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  description: text("description"),
  type: varchar("type", { length: 30 }).notNull().default("custom"), // employee_pack | device | storage | module | custom
  quantity: integer("quantity").notNull().default(1), // e.g. employee pack of 25
  moduleKey: varchar("module_key", { length: 40 }),   // for type=module
  monthlyPrice: numeric("monthly_price", { precision: 12, scale: 2 }).notNull().default("0"),
  yearlyPrice: numeric("yearly_price", { precision: 12, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const companyAddons = pgTable("company_addons", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  addonId: uuid("addon_id").notNull().references(() => subscriptionAddons.id),
  units: integer("units").notNull().default(1),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(), // per unit, snapshot (override allowed)
  addedBy: uuid("added_by"),
  ...timestamps,
}, (t) => [index("company_addons_company_idx").on(t.companyId)]);

export const subscriptionInvoices = pgTable("subscription_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  paymentId: uuid("payment_id"), // set once a Razorpay payment settles this invoice
  invoiceNumber: varchar("invoice_number", { length: 30 }).notNull().unique(),
  planName: varchar("plan_name", { length: 100 }),
  basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull().default("0"),
  additionalBranchPrice: numeric("additional_branch_price", { precision: 12, scale: 2 }).notNull().default("0"),
  additionalEmployeePrice: numeric("additional_employee_price", { precision: 12, scale: 2 }).notNull().default("0"),
  additionalDevicePrice: numeric("additional_device_price", { precision: 12, scale: 2 }).notNull().default("0"),
  addonsPrice: numeric("addons_price", { precision: 12, scale: 2 }).notNull().default("0"),
  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }).notNull().default("18"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  reason: varchar("reason", { length: 60 }).notNull(), // plan_assigned | renewal | branch_approved | addon_added
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | paid | cancelled
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("invoices_company_idx").on(t.companyId)]);

// ---------- Self-service signup & Razorpay payments ----------
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id"),
  invoiceId: uuid("invoice_id"),
  provider: varchar("provider", { length: 20 }).notNull().default("razorpay"),
  purpose: varchar("purpose", { length: 20 }).notNull().default("new_subscription"), // new_subscription | renewal | upgrade | addon
  planId: uuid("plan_id").references(() => subscriptionPlans.id),
  billingCycle: varchar("billing_cycle", { length: 10 }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"), // INR, tax-inclusive
  currency: varchar("currency", { length: 5 }).notNull().default("INR"),
  razorpayOrderId: varchar("razorpay_order_id", { length: 80 }).unique(),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 80 }),
  razorpaySignature: text("razorpay_signature"),
  status: varchar("status", { length: 20 }).notNull().default("created"), // created | paid | failed | refunded
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdBy: uuid("created_by"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("payments_company_idx").on(t.companyId), index("payments_order_idx").on(t.razorpayOrderId)]);

// ---------- Phase 3: Core HRMS ----------
export const employmentTypeEnum = pgEnum("employment_type", ["full_time", "part_time", "intern", "contract", "freelancer", "consultant"]);
export const employeeStatusEnum = pgEnum("employee_status", ["active", "inactive", "probation", "notice_period", "resigned", "terminated"]);
export const docVerificationEnum = pgEnum("doc_verification", ["pending", "verified", "rejected"]);

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }), // null = company-wide
  name: varchar("name", { length: 120 }).notNull(),
  code: varchar("code", { length: 30 }),
  headEmployeeId: uuid("head_employee_id"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [index("departments_company_idx").on(t.companyId)]);

export const designations = pgTable("designations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  level: integer("level").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [index("designations_company_idx").on(t.companyId)]);

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  designationId: uuid("designation_id").references(() => designations.id, { onDelete: "set null" }),
  reportingManagerId: uuid("reporting_manager_id"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }), // self-service login
  employeeCode: varchar("employee_code", { length: 40 }).notNull(),
  firstName: varchar("first_name", { length: 80 }).notNull(),
  lastName: varchar("last_name", { length: 80 }).notNull().default(""),
  photoUrl: text("photo_url"),
  gender: varchar("gender", { length: 20 }),
  dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
  email: varchar("email", { length: 200 }),
  mobile: varchar("mobile", { length: 30 }),
  joiningDate: timestamp("joining_date", { withTimezone: true }).notNull(),
  employmentType: employmentTypeEnum("employment_type").notNull().default("full_time"),
  status: employeeStatusEnum("status").notNull().default("active"),
  probationEndDate: timestamp("probation_end_date", { withTimezone: true }),
  exitDate: timestamp("exit_date", { withTimezone: true }),
  // personal
  fatherName: varchar("father_name", { length: 120 }), motherName: varchar("mother_name", { length: 120 }),
  maritalStatus: varchar("marital_status", { length: 20 }), spouseName: varchar("spouse_name", { length: 120 }),
  nationality: varchar("nationality", { length: 60 }).default("Indian"), bloodGroup: varchar("blood_group", { length: 5 }),
  // address
  currentAddress: text("current_address"), permanentAddress: text("permanent_address"),
  country: varchar("country", { length: 100 }).default("India"), state: varchar("state", { length: 100 }), city: varchar("city", { length: 100 }), pinCode: varchar("pin_code", { length: 12 }),
  // emergency
  emergencyContactName: varchar("emergency_contact_name", { length: 120 }), emergencyContactRelation: varchar("emergency_contact_relation", { length: 60 }), emergencyContactMobile: varchar("emergency_contact_mobile", { length: 30 }),
  // ids
  panNumber: varchar("pan_number", { length: 20 }), aadhaarLast4: varchar("aadhaar_last4", { length: 4 }), uanNumber: varchar("uan_number", { length: 20 }), esiNumber: varchar("esi_number", { length: 20 }),
  deviceUserId: varchar("device_user_id", { length: 40 }), // biometric device mapping (Phase 5)
  ...timestamps,
}, (t) => [index("employees_company_idx").on(t.companyId), index("employees_branch_idx").on(t.branchId), uniqueIndex("employees_code_idx").on(t.companyId, t.employeeCode)]);

export const employeeBankDetails = pgTable("employee_bank_details", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }).unique(),
  bankName: varchar("bank_name", { length: 120 }), accountHolder: varchar("account_holder", { length: 120 }),
  accountNumber: varchar("account_number", { length: 40 }), ifsc: varchar("ifsc", { length: 15 }), branchName: varchar("branch_name", { length: 120 }), upiId: varchar("upi_id", { length: 80 }),
  ...timestamps,
});

export const employeeDocuments = pgTable("employee_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull(), // aadhaar | pan | passport | driving_license | resume | offer_letter | joining_letter | experience_letter | certificate | other
  title: varchar("title", { length: 150 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: varchar("mime_type", { length: 100 }), sizeBytes: integer("size_bytes"),
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  verification: docVerificationEnum("verification").notNull().default("pending"),
  verifiedBy: uuid("verified_by"), verifiedAt: timestamp("verified_at", { withTimezone: true }),
  uploadedBy: uuid("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("employee_docs_employee_idx").on(t.employeeId)]);

export const employeeTransfers = pgTable("employee_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  fromBranchId: uuid("from_branch_id"), toBranchId: uuid("to_branch_id").notNull(),
  fromDepartmentId: uuid("from_department_id"), toDepartmentId: uuid("to_department_id"),
  transferDate: timestamp("transfer_date", { withTimezone: true }).notNull(),
  reason: text("reason"), approvedBy: uuid("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const employeeStatusHistory = pgTable("employee_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  fromStatus: employeeStatusEnum("from_status"), toStatus: employeeStatusEnum("to_status").notNull(),
  effectiveDate: timestamp("effective_date", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"), changedBy: uuid("changed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Phase 4: Attendance ----------
export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "absent", "half_day", "late", "early_out", "work_from_home", "on_leave", "holiday", "week_off", "missing_punch"]);
export const attendanceSourceEnum = pgEnum("attendance_source", ["biometric", "face", "rfid", "web", "manual", "mobile", "gps", "selfie"]);
export const breakReasonEnum = pgEnum("attendance_break_reason", ["inactivity", "manual", "lunch", "personal", "system"]);
export const liveStatusEnum = pgEnum("attendance_live_status", ["working", "break", "offline"]);
export const correctionTypeEnum = pgEnum("attendance_correction_type", ["forgot_checkin", "forgot_checkout", "wrong_location", "device_problem", "network_problem", "timer_issue", "other"]);
export const correctionStatusEnum = pgEnum("attendance_correction_status", ["pending", "approved", "rejected"]);

export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  name: varchar("name", { length: 80 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default("general"), // general | morning | evening | night | flexible
  startTime: varchar("start_time", { length: 5 }).notNull(), // "09:30"
  endTime: varchar("end_time", { length: 5 }).notNull(),     // "18:30" — night shift: end < start => next day
  graceMinutes: integer("grace_minutes").notNull().default(10),
  minWorkMinutes: integer("min_work_minutes").notNull().default(480),   // full day
  halfDayMinutes: integer("half_day_minutes").notNull().default(240),
  lateAfterMinutes: integer("late_after_minutes").notNull().default(10),  // late if in > start+this
  earlyOutBeforeMinutes: integer("early_out_before_minutes").notNull().default(10),
  overtimeAfterMinutes: integer("overtime_after_minutes").notNull().default(540),
  weekOffDays: jsonb("week_off_days").$type<number[]>().notNull().default([0]), // 0=Sun
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [index("shifts_company_idx").on(t.companyId)]);

export const employeeShifts = pgTable("employee_shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id, { onDelete: "cascade" }),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("employee_shifts_emp_idx").on(t.employeeId)]);

export const holidays = pgTable("holidays", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }), // null => company-wide
  name: varchar("name", { length: 120 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  isOptional: boolean("is_optional").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("holidays_company_date_idx").on(t.companyId, t.date)]);

// Raw punches — kabhi edit nahi hote (Section 58)
export const attendanceLogs = pgTable("attendance_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id"),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  deviceId: uuid("device_id"),
  deviceUserId: varchar("device_user_id", { length: 40 }),
  punchedAt: timestamp("punched_at", { withTimezone: true }).notNull(),
  direction: varchar("direction", { length: 10 }).default("unknown"), // in | out | unknown
  source: attendanceSourceEnum("source").notNull().default("manual"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }), longitude: numeric("longitude", { precision: 10, scale: 7 }),
  selfieUrl: text("selfie_url"), ip: varchar("ip", { length: 60 }),
  gpsAccuracyM: numeric("gps_accuracy_m", { precision: 8, scale: 2 }), distanceM: numeric("distance_m", { precision: 8, scale: 2 }), // captured at punch time for fraud review
  // Set only on an "out" punch that is a break-start, not a real checkout — lets the existing
  // in/out pairing in processor.ts double as session/break tracking with zero changes there.
  breakReason: breakReasonEnum("break_reason"),
  dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("attendance_logs_dedupe_idx").on(t.dedupeKey), index("attendance_logs_emp_time_idx").on(t.employeeId, t.punchedAt)]);

// Final daily attendance — processor ka output
export const attendance = pgTable("attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").notNull(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(), // attendance date (shift start date)
  shiftId: uuid("shift_id"),
  status: attendanceStatusEnum("status").notNull().default("absent"),
  checkIn: timestamp("check_in", { withTimezone: true }), checkOut: timestamp("check_out", { withTimezone: true }),
  workMinutes: integer("work_minutes").notNull().default(0), breakMinutes: integer("break_minutes").notNull().default(0),
  lateMinutes: integer("late_minutes").notNull().default(0), earlyOutMinutes: integer("early_out_minutes").notNull().default(0), overtimeMinutes: integer("overtime_minutes").notNull().default(0),
  punchCount: integer("punch_count").notNull().default(0),
  source: attendanceSourceEnum("source"),
  isManual: boolean("is_manual").notNull().default(false), // regularised by HR — processor override nahi karega
  remarks: text("remarks"), approvedBy: uuid("approved_by"),
  ...timestamps,
}, (t) => [uniqueIndex("attendance_emp_date_idx").on(t.employeeId, t.date), index("attendance_company_date_idx").on(t.companyId, t.date)]);

// Current live status — one row per employee, upserted. This is NOT the source of truth for
// time totals (attendanceLogs + the existing in/out pairing in processor.ts already gives
// exact session/break durations with zero changes to that logic); it exists purely so the
// admin live dashboard and the inactivity-heartbeat job have an O(1) "what's happening right
// now" lookup instead of re-deriving it from today's punches on every request.
export const attendanceLive = pgTable("attendance_live", {
  employeeId: uuid("employee_id").primaryKey().references(() => employees.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").notNull(),
  status: liveStatusEnum("status").notNull().default("offline"),
  breakReason: breakReasonEnum("break_reason"),
  since: timestamp("since", { withTimezone: true }), // when the current status began
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }), // heartbeat watermark, status = working only
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("attendance_live_company_status_idx").on(t.companyId, t.status)]);

export const attendanceCorrections = pgTable("attendance_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(),
  type: correctionTypeEnum("type").notNull(),
  requestedCheckIn: timestamp("requested_check_in", { withTimezone: true }),
  requestedCheckOut: timestamp("requested_check_out", { withTimezone: true }),
  reason: text("reason").notNull(),
  status: correctionStatusEnum("status").notNull().default("pending"),
  reviewedBy: uuid("reviewed_by"), reviewedAt: timestamp("reviewed_at", { withTimezone: true }), reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("attendance_corrections_emp_idx").on(t.employeeId, t.date), index("attendance_corrections_company_status_idx").on(t.companyId, t.status)]);

// ---------- Phase 5: Hardware ----------
export const deviceStatusEnum = pgEnum("device_status", ["online", "offline", "syncing", "error", "disabled"]);
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  name: varchar("name", { length: 120 }).notNull(),
  type: varchar("type", { length: 30 }).notNull().default("fingerprint"), // fingerprint | face | rfid | access_control
  brand: varchar("brand", { length: 40 }).notNull().default("zkteco"),    // adapter key: zkteco | essl | matrix | adms | simulator
  model: varchar("model", { length: 80 }),
  serialNumber: varchar("serial_number", { length: 80 }).notNull(),
  ipAddress: varchar("ip_address", { length: 60 }), port: integer("port").default(4370),
  location: varchar("location", { length: 120 }),
  pollIntervalSec: integer("poll_interval_sec").notNull().default(60),
  status: deviceStatusEnum("status").notNull().default("offline"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastLogAt: timestamp("last_log_at", { withTimezone: true }),
  userCount: integer("user_count").notNull().default(0),
  lastError: text("last_error"),
  pushUsersRequested: boolean("push_users_requested").notNull().default(false), // agent will push employee list on next cycle
  ...timestamps,
}, (t) => [index("devices_company_idx").on(t.companyId), uniqueIndex("devices_serial_idx").on(t.companyId, t.serialNumber)]);

// Per-device employee mapping (device user id may differ per device)
export const deviceEmployees = pgTable("device_employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  deviceUserId: varchar("device_user_id", { length: 40 }).notNull(),
  syncedToDevice: boolean("synced_to_device").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("device_employees_idx").on(t.deviceId, t.employeeId), index("device_employees_uid_idx").on(t.deviceId, t.deviceUserId)]);

// Sync / error events (Section 135)
export const deviceLogs = pgTable("device_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  level: varchar("level", { length: 10 }).notNull().default("info"), // info | warn | error
  event: varchar("event", { length: 40 }).notNull(), // heartbeat | sync | ingest | users_pushed | error | status
  message: text("message"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("device_logs_device_idx").on(t.deviceId, t.createdAt)]);

// ---------- Phase 6: Leave ----------
export const leaveRequestStatusEnum = pgEnum("leave_request_status", ["pending", "manager_approved", "approved", "rejected", "cancelled"]);
export const leaveTypes = pgTable("leave_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(), code: varchar("code", { length: 10 }).notNull(), // CL, SL, EL, LWP, ML, PL, CO, WFH
  isPaid: boolean("is_paid").notNull().default(true),
  kind: varchar("kind", { length: 20 }).notNull().default("leave"), // leave | wfh | comp_off
  annualQuota: numeric("annual_quota", { precision: 6, scale: 2 }).notNull().default("0"),
  accrual: varchar("accrual", { length: 10 }).notNull().default("yearly"), // yearly (Jan 1 full) | monthly (quota/12 each month) | none (manual, e.g. comp-off)
  carryForwardMax: numeric("carry_forward_max", { precision: 6, scale: 2 }).notNull().default("0"),
  encashable: boolean("encashable").notNull().default(false),
  allowHalfDay: boolean("allow_half_day").notNull().default(true),
  allowNegative: boolean("allow_negative").notNull().default(false),
  approvalLevels: integer("approval_levels").notNull().default(1), // 1 = manager, 2 = manager + HR
  minNoticeDays: integer("min_notice_days").notNull().default(0),
  maxConsecutiveDays: integer("max_consecutive_days"),
  applicableGenders: jsonb("applicable_genders").$type<string[]>(), // e.g. ["female"] for maternity
  probationAllowed: boolean("probation_allowed").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (t) => [uniqueIndex("leave_types_code_idx").on(t.companyId, t.code)]);

export const leaveBalances = pgTable("leave_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  leaveTypeId: uuid("leave_type_id").notNull().references(() => leaveTypes.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  allocated: numeric("allocated", { precision: 6, scale: 2 }).notNull().default("0"),
  carriedForward: numeric("carried_forward", { precision: 6, scale: 2 }).notNull().default("0"),
  adjusted: numeric("adjusted", { precision: 6, scale: 2 }).notNull().default("0"), // manual +/- by HR, comp-off credits
  used: numeric("used", { precision: 6, scale: 2 }).notNull().default("0"),
  encashed: numeric("encashed", { precision: 6, scale: 2 }).notNull().default("0"),
  lastAccruedMonth: varchar("last_accrued_month", { length: 7 }),
  ...timestamps,
}, (t) => [uniqueIndex("leave_balances_idx").on(t.employeeId, t.leaveTypeId, t.year)]);

export const leaveRequests = pgTable("leave_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").notNull(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  leaveTypeId: uuid("leave_type_id").notNull().references(() => leaveTypes.id),
  fromDate: varchar("from_date", { length: 10 }).notNull(), toDate: varchar("to_date", { length: 10 }).notNull(),
  halfDay: varchar("half_day", { length: 10 }), // null | first_half | second_half (single-day only)
  days: numeric("days", { precision: 5, scale: 2 }).notNull(), // working days excluding holidays/week-offs
  reason: text("reason"),
  contactDuringLeave: varchar("contact_during_leave", { length: 60 }),
  status: leaveRequestStatusEnum("status").notNull().default("pending"),
  currentLevel: integer("current_level").notNull().default(1),
  approvals: jsonb("approvals").$type<{ level: number; by: string; byName: string; action: "approved" | "rejected"; note?: string; at: string }[]>().notNull().default([]),
  rejectionReason: text("rejection_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("leave_requests_emp_idx").on(t.employeeId, t.fromDate), index("leave_requests_company_status_idx").on(t.companyId, t.status)]);

export const leaveLedger = pgTable("leave_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  leaveTypeId: uuid("leave_type_id").notNull(),
  year: integer("year").notNull(),
  delta: numeric("delta", { precision: 6, scale: 2 }).notNull(), // +credit / -debit
  kind: varchar("kind", { length: 20 }).notNull(), // allocation | accrual | carry_forward | adjustment | comp_off | used | reverted | encashed
  refId: uuid("ref_id"), note: text("note"), by: uuid("by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("leave_ledger_emp_idx").on(t.employeeId, t.year)]);

// ---------- Phase 7: Payroll ----------
export const payrollStatusEnum = pgEnum("payroll_status", ["draft", "processing", "pending_approval", "approved", "paid", "cancelled"]);
export const salaryComponents = pgTable("salary_components", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(), code: varchar("code", { length: 20 }).notNull(),
  type: varchar("type", { length: 12 }).notNull().default("earning"), // earning | deduction
  calc: varchar("calc", { length: 20 }).notNull().default("fixed"),   // fixed | percent_basic | percent_gross
  defaultValue: numeric("default_value", { precision: 12, scale: 2 }).notNull().default("0"),
  isTaxable: boolean("is_taxable").notNull().default(true),
  isProrated: boolean("is_prorated").notNull().default(true), // LOP par kam hota hai
  isStatutory: boolean("is_statutory").notNull().default(false), // PF/ESI/PT/TDS engine se aate hain, structure mein nahi
  sortOrder: integer("sort_order").notNull().default(0), isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [uniqueIndex("salary_components_code_idx").on(t.companyId, t.code)]);

export const employeeSalaries = pgTable("employee_salaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  effectiveFrom: varchar("effective_from", { length: 10 }).notNull(),
  ctcMonthly: numeric("ctc_monthly", { precision: 12, scale: 2 }).notNull().default("0"),
  components: jsonb("components").$type<{ componentId: string; code: string; value: number }[]>().notNull().default([]), // value = amount (fixed) or percent
  pfOptIn: boolean("pf_opt_in").notNull().default(true), esiOptIn: boolean("esi_opt_in").notNull().default(true), ptApplicable: boolean("pt_applicable").notNull().default(true),
  tdsMonthly: numeric("tds_monthly", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentMode: varchar("payment_mode", { length: 20 }).notNull().default("bank"),
  note: text("note"), createdBy: uuid("created_by"),
  ...timestamps,
}, (t) => [index("employee_salaries_emp_idx").on(t.employeeId, t.effectiveFrom)]);

export const salaryAdvances = pgTable("salary_advances", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 10 }).notNull().default("advance"), // advance | loan
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  installment: numeric("installment", { precision: 12, scale: 2 }).notNull(),
  recovered: numeric("recovered", { precision: 12, scale: 2 }).notNull().default("0"),
  startMonth: varchar("start_month", { length: 7 }).notNull(),
  status: varchar("status", { length: 10 }).notNull().default("active"), // active | closed
  note: text("note"), createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const payrollRuns = pgTable("payroll_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id"), // null = all branches
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  status: payrollStatusEnum("status").notNull().default("draft"),
  employeeCount: integer("employee_count").notNull().default(0),
  totalGross: numeric("total_gross", { precision: 14, scale: 2 }).notNull().default("0"),
  totalDeductions: numeric("total_deductions", { precision: 14, scale: 2 }).notNull().default("0"),
  totalNet: numeric("total_net", { precision: 14, scale: 2 }).notNull().default("0"),
  totalEmployerCost: numeric("total_employer_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  processedAt: timestamp("processed_at", { withTimezone: true }), approvedBy: uuid("approved_by"), approvedAt: timestamp("approved_at", { withTimezone: true }), paidAt: timestamp("paid_at", { withTimezone: true }),
  note: text("note"), createdBy: uuid("created_by"),
  ...timestamps,
}, (t) => [uniqueIndex("payroll_runs_month_idx").on(t.companyId, t.month, t.branchId)]);

export const payrollItems = pgTable("payroll_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  runId: uuid("run_id").notNull().references(() => payrollRuns.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  daysInMonth: integer("days_in_month").notNull(), payableDays: numeric("payable_days", { precision: 5, scale: 2 }).notNull(), lopDays: numeric("lop_days", { precision: 5, scale: 2 }).notNull().default("0"),
  attendance: jsonb("attendance").$type<{ present: number; halfDay: number; absent: number; paidLeave: number; unpaidLeave: number; holidays: number; weekOffs: number; overtimeMinutes: number }>().notNull(),
  earnings: jsonb("earnings").$type<{ code: string; name: string; amount: number; full: number }[]>().notNull().default([]),
  deductions: jsonb("deductions").$type<{ code: string; name: string; amount: number }[]>().notNull().default([]),
  employer: jsonb("employer").$type<{ code: string; name: string; amount: number }[]>().notNull().default([]),
  gross: numeric("gross", { precision: 12, scale: 2 }).notNull(), totalDeductions: numeric("total_deductions", { precision: 12, scale: 2 }).notNull(), net: numeric("net", { precision: 12, scale: 2 }).notNull(),
  employerCost: numeric("employer_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  bankSnapshot: jsonb("bank_snapshot").$type<Record<string, string | null>>(),
  status: varchar("status", { length: 12 }).notNull().default("computed"), // computed | held | paid
  remarks: text("remarks"),
  ...timestamps,
}, (t) => [uniqueIndex("payroll_items_idx").on(t.runId, t.employeeId), index("payroll_items_emp_idx").on(t.employeeId, t.month)]);

// ---------- Phase 8: Advanced HR ----------
// Expenses (75–76)
export const expenseCategories = pgTable("expense_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(), maxAmount: numeric("max_amount", { precision: 12, scale: 2 }), requiresReceipt: boolean("requires_receipt").notNull().default(true), isActive: boolean("is_active").notNull().default(true),
});
export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").notNull(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => expenseCategories.id),
  title: varchar("title", { length: 150 }).notNull(), description: text("description"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), expenseDate: varchar("expense_date", { length: 10 }).notNull(),
  receiptUrl: text("receipt_url"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | manager_approved | approved | rejected | paid
  approvals: jsonb("approvals").$type<{ level: number; by: string; byName: string; action: string; note?: string; at: string }[]>().notNull().default([]),
  rejectionReason: text("rejection_reason"), paidAt: timestamp("paid_at", { withTimezone: true }), paidRef: varchar("paid_ref", { length: 80 }),
  ...timestamps,
}, (t) => [index("expenses_emp_idx").on(t.employeeId), index("expenses_company_status_idx").on(t.companyId, t.status)]);

// Recruitment / ATS (77–82)
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id"), departmentId: uuid("department_id"), designationId: uuid("designation_id"),
  title: varchar("title", { length: 150 }).notNull(), description: text("description"),
  experienceMin: integer("experience_min").default(0), experienceMax: integer("experience_max"),
  salaryMin: numeric("salary_min", { precision: 12, scale: 2 }), salaryMax: numeric("salary_max", { precision: 12, scale: 2 }),
  location: varchar("location", { length: 120 }), skills: jsonb("skills").$type<string[]>().notNull().default([]),
  openings: integer("openings").notNull().default(1), employmentType: varchar("employment_type", { length: 20 }).default("full_time"),
  status: varchar("status", { length: 12 }).notNull().default("open"), // draft | open | on_hold | closed
  createdBy: uuid("created_by"),
  ...timestamps,
}, (t) => [index("jobs_company_idx").on(t.companyId)]);
export const candidates = pgTable("candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 150 }).notNull(), email: varchar("email", { length: 200 }), mobile: varchar("mobile", { length: 30 }),
  resumeUrl: text("resume_url"), skills: jsonb("skills").$type<string[]>().notNull().default([]), experienceYears: numeric("experience_years", { precision: 4, scale: 1 }),
  education: varchar("education", { length: 200 }), currentCompany: varchar("current_company", { length: 150 }), currentCtc: numeric("current_ctc", { precision: 12, scale: 2 }), expectedCtc: numeric("expected_ctc", { precision: 12, scale: 2 }), noticeDays: integer("notice_days"),
  source: varchar("source", { length: 40 }), // referral | portal | linkedin | walk-in
  stage: varchar("stage", { length: 20 }).notNull().default("applied"), // applied | screening | interview | selected | offer_sent | joined | rejected
  rating: integer("rating"), notes: text("notes"), rejectionReason: text("rejection_reason"),
  offerLetter: text("offer_letter"), offerSentAt: timestamp("offer_sent_at", { withTimezone: true }),
  employeeId: uuid("employee_id"), // set when joined
  ...timestamps,
}, (t) => [index("candidates_job_idx").on(t.jobId, t.stage)]);
export const interviews = pgTable("interviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  round: integer("round").notNull().default(1), type: varchar("type", { length: 20 }).notNull().default("technical"), // telephonic | technical | hr | final
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(), durationMin: integer("duration_min").default(45),
  interviewerId: uuid("interviewer_id").references(() => employees.id, { onDelete: "set null" }), meetingLink: text("meeting_link"), location: varchar("location", { length: 120 }),
  status: varchar("status", { length: 12 }).notNull().default("scheduled"), // scheduled | completed | cancelled | no_show
  feedback: text("feedback"), rating: integer("rating"), recommendation: varchar("recommendation", { length: 12 }), // hire | no_hire | hold
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const offerTemplates = pgTable("offer_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(), body: text("body").notNull(), isDefault: boolean("is_default").notNull().default(false),
  ...timestamps,
});

// Performance (83–85)
export const performanceGoals = pgTable("performance_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  cycleId: uuid("cycle_id"),
  title: varchar("title", { length: 200 }).notNull(), description: text("description"),
  type: varchar("type", { length: 10 }).notNull().default("goal"), // goal | kpi | okr
  targetValue: numeric("target_value", { precision: 14, scale: 2 }), currentValue: numeric("current_value", { precision: 14, scale: 2 }).default("0"), unit: varchar("unit", { length: 20 }),
  progress: integer("progress").notNull().default(0), weight: integer("weight").notNull().default(1),
  dueDate: varchar("due_date", { length: 10 }), status: varchar("status", { length: 12 }).notNull().default("active"), // active | completed | cancelled
  createdBy: uuid("created_by"),
  ...timestamps,
}, (t) => [index("goals_emp_idx").on(t.employeeId)]);
export const reviewCycles = pgTable("review_cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(), periodStart: varchar("period_start", { length: 10 }).notNull(), periodEnd: varchar("period_end", { length: 10 }).notNull(),
  status: varchar("status", { length: 12 }).notNull().default("open"), // draft | open | closed
  ratingScale: integer("rating_scale").notNull().default(5),
  ...timestamps,
});
export const performanceReviews = pgTable("performance_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  cycleId: uuid("cycle_id").notNull().references(() => reviewCycles.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  selfRating: integer("self_rating"), selfComments: text("self_comments"), selfSubmittedAt: timestamp("self_submitted_at", { withTimezone: true }),
  managerRating: integer("manager_rating"), managerComments: text("manager_comments"), managerId: uuid("manager_id"), managerSubmittedAt: timestamp("manager_submitted_at", { withTimezone: true }),
  hrRating: integer("hr_rating"), hrComments: text("hr_comments"), hrSubmittedAt: timestamp("hr_submitted_at", { withTimezone: true }),
  finalRating: numeric("final_rating", { precision: 3, scale: 1 }), status: varchar("status", { length: 16 }).notNull().default("self_pending"), // self_pending | manager_pending | hr_pending | completed
  ...timestamps,
}, (t) => [uniqueIndex("reviews_cycle_emp_idx").on(t.cycleId, t.employeeId)]);

// Help desk (96)
export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 20 }).notNull().default("hr"), // hr | it | accounts | admin
  priority: varchar("priority", { length: 10 }).notNull().default("normal"), // low | normal | high | urgent
  subject: varchar("subject", { length: 200 }).notNull(), description: text("description"),
  status: varchar("status", { length: 12 }).notNull().default("open"), // open | in_progress | resolved | closed
  assignedTo: uuid("assigned_to"), // user id
  comments: jsonb("comments").$type<{ by: string; byName: string; text: string; at: string; internal?: boolean }[]>().notNull().default([]),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("tickets_company_idx").on(t.companyId, t.status), uniqueIndex("tickets_number_idx").on(t.companyId, t.number)]);

// Announcements (93)
export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(), body: text("body").notNull(),
  targetType: varchar("target_type", { length: 12 }).notNull().default("company"), // company | branch | department | employees
  targetIds: jsonb("target_ids").$type<string[]>().notNull().default([]),
  priority: varchar("priority", { length: 10 }).notNull().default("info"), // info | success | warning | critical
  eventDate: varchar("event_date", { length: 10 }), // shows on calendar
  publishAt: timestamp("publish_at", { withTimezone: true }).defaultNow().notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdBy: uuid("created_by"), createdByName: varchar("created_by_name", { length: 150 }),
  ...timestamps,
}, (t) => [index("announcements_company_idx").on(t.companyId, t.publishAt)]);

// ---------- Phase 9: Notifications, Automation ----------
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id"), // null = platform
  userId: uuid("user_id").notNull(),
  type: varchar("type", { length: 40 }).notNull(), // leave.approved, payroll.paid, subscription.expiring …
  priority: varchar("priority", { length: 10 }).notNull().default("info"), // info | success | warning | critical
  title: varchar("title", { length: 200 }).notNull(), body: text("body"),
  link: varchar("link", { length: 200 }),
  channels: jsonb("channels").$type<Record<string, "queued" | "sent" | "failed" | "skipped">>().notNull().default({}),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.readAt)]);

export const notificationSettings = pgTable("notification_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }).unique(),
  email: jsonb("email").$type<{ enabled: boolean; host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string }>().notNull().default({ enabled: false }),
  sms: jsonb("sms").$type<{ enabled: boolean; provider?: "msg91" | "twilio"; authKey?: string; senderId?: string; templateId?: string }>().notNull().default({ enabled: false }),
  whatsapp: jsonb("whatsapp").$type<{ enabled: boolean; provider?: "msg91" | "interakt" | "generic"; apiKey?: string; endpoint?: string; namespace?: string }>().notNull().default({ enabled: false }),
  events: jsonb("events").$type<Record<string, { inApp: boolean; email: boolean; sms: boolean; whatsapp: boolean }>>().notNull().default({}),
  ...timestamps,
});

export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  trigger: varchar("trigger", { length: 40 }).notNull(), // event key: attendance.late, leave.requested, employee.joined, document.expiring, subscription.expiring, ticket.created, expense.submitted
  conditions: jsonb("conditions").$type<{ field: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains"; value: string | number }[]>().notNull().default([]),
  actions: jsonb("actions").$type<{ type: "notify" | "email" | "sms" | "whatsapp" | "create_ticket" | "webhook"; to: "employee" | "manager" | "hr" | "admins" | "custom"; custom?: string; template?: string; url?: string }[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  runCount: integer("run_count").notNull().default(0), lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("automation_company_trigger_idx").on(t.companyId, t.trigger)]);

export const automationLogs = pgTable("automation_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(), ruleId: uuid("rule_id").notNull().references(() => automationRules.id, { onDelete: "cascade" }),
  trigger: varchar("trigger", { length: 40 }).notNull(), payload: jsonb("payload").$type<Record<string, unknown>>(), result: varchar("result", { length: 12 }).notNull(), message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
