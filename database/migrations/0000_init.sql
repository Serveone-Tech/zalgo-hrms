CREATE TYPE "public"."attendance_source" AS ENUM('biometric', 'face', 'rfid', 'web', 'manual', 'mobile', 'gps', 'selfie');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'half_day', 'late', 'early_out', 'work_from_home', 'on_leave', 'holiday', 'week_off', 'missing_punch');--> statement-breakpoint
CREATE TYPE "public"."branch_request_status" AS ENUM('draft', 'pending', 'under_review', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."branch_status" AS ENUM('inactive', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."company_status" AS ENUM('trial', 'active', 'inactive', 'suspended', 'expired');--> statement-breakpoint
CREATE TYPE "public"."data_scope" AS ENUM('own', 'team', 'department', 'branch', 'company');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('online', 'offline', 'syncing', 'error', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."doc_verification" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'inactive', 'probation', 'notice_period', 'resigned', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full_time', 'part_time', 'intern', 'contract', 'freelancer', 'consultant');--> statement-breakpoint
CREATE TYPE "public"."leave_request_status" AS ENUM('pending', 'manager_approved', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payroll_status" AS ENUM('draft', 'processing', 'pending_approval', 'approved', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'pending_payment', 'expired', 'cancelled', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('super_admin', 'company_user');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"target_type" varchar(12) DEFAULT 'company' NOT NULL,
	"target_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" varchar(10) DEFAULT 'info' NOT NULL,
	"event_date" varchar(10),
	"publish_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_by_name" varchar(150),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" varchar(10) NOT NULL,
	"shift_id" uuid,
	"status" "attendance_status" DEFAULT 'absent' NOT NULL,
	"check_in" timestamp with time zone,
	"check_out" timestamp with time zone,
	"work_minutes" integer DEFAULT 0 NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"early_out_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"punch_count" integer DEFAULT 0 NOT NULL,
	"source" "attendance_source",
	"is_manual" boolean DEFAULT false NOT NULL,
	"remarks" text,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"employee_id" uuid,
	"device_id" uuid,
	"device_user_id" varchar(40),
	"punched_at" timestamp with time zone NOT NULL,
	"direction" varchar(10) DEFAULT 'unknown',
	"source" "attendance_source" DEFAULT 'manual' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"selfie_url" text,
	"ip" varchar(60),
	"dedupe_key" varchar(160) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"user_id" uuid,
	"user_name" varchar(150),
	"action" varchar(60) NOT NULL,
	"entity" varchar(60) NOT NULL,
	"entity_id" varchar(80),
	"details" jsonb,
	"ip" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"trigger" varchar(40) NOT NULL,
	"payload" jsonb,
	"result" varchar(12) NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"trigger" varchar(40) NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" varchar(150) NOT NULL,
	"code" varchar(50),
	"address" text,
	"country" varchar(100) DEFAULT 'India',
	"state" varchar(100),
	"city" varchar(100),
	"pin_code" varchar(12),
	"expected_employees" integer DEFAULT 0,
	"expected_devices" integer DEFAULT 0,
	"reason" text,
	"branch_type" varchar(50),
	"expected_opening_date" timestamp with time zone,
	"status" "branch_request_status" DEFAULT 'pending' NOT NULL,
	"default_price" numeric(12, 2) DEFAULT '0',
	"approved_price" numeric(12, 2),
	"rejection_reason" text,
	"requested_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"code" varchar(50),
	"is_head_office" boolean DEFAULT false NOT NULL,
	"address" text,
	"country" varchar(100) DEFAULT 'India',
	"state" varchar(100),
	"city" varchar(100),
	"pin_code" varchar(12),
	"timezone" varchar(60) DEFAULT 'Asia/Kolkata' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"geofence_radius_m" integer,
	"status" "branch_status" DEFAULT 'inactive' NOT NULL,
	"approved_price" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"email" varchar(200),
	"mobile" varchar(30),
	"resume_url" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience_years" numeric(4, 1),
	"education" varchar(200),
	"current_company" varchar(150),
	"current_ctc" numeric(12, 2),
	"expected_ctc" numeric(12, 2),
	"notice_days" integer,
	"source" varchar(40),
	"stage" varchar(20) DEFAULT 'applied' NOT NULL,
	"rating" integer,
	"notes" text,
	"rejection_reason" text,
	"offer_letter" text,
	"offer_sent_at" timestamp with time zone,
	"employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"code" varchar(50),
	"logo_url" text,
	"email" varchar(200),
	"mobile" varchar(30),
	"website" varchar(200),
	"gst_number" varchar(30),
	"pan_number" varchar(20),
	"address" text,
	"country" varchar(100) DEFAULT 'India',
	"state" varchar(100),
	"city" varchar(100),
	"pin_code" varchar(12),
	"timezone" varchar(60) DEFAULT 'Asia/Kolkata' NOT NULL,
	"status" "company_status" DEFAULT 'trial' NOT NULL,
	"agent_key" varchar(80),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "company_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"addon_id" uuid NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" varchar(120) NOT NULL,
	"code" varchar(30),
	"head_employee_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "designations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"device_user_id" varchar(40) NOT NULL,
	"synced_to_device" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"level" varchar(10) DEFAULT 'info' NOT NULL,
	"event" varchar(40) NOT NULL,
	"message" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(30) DEFAULT 'fingerprint' NOT NULL,
	"brand" varchar(40) DEFAULT 'zkteco' NOT NULL,
	"model" varchar(80),
	"serial_number" varchar(80) NOT NULL,
	"ip_address" varchar(60),
	"port" integer DEFAULT 4370,
	"location" varchar(120),
	"poll_interval_sec" integer DEFAULT 60 NOT NULL,
	"status" "device_status" DEFAULT 'offline' NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_log_at" timestamp with time zone,
	"user_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"push_users_requested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"bank_name" varchar(120),
	"account_holder" varchar(120),
	"account_number" varchar(40),
	"ifsc" varchar(15),
	"branch_name" varchar(120),
	"upi_id" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_bank_details_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"title" varchar(150) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" varchar(100),
	"size_bytes" integer,
	"expiry_date" timestamp with time zone,
	"verification" "doc_verification" DEFAULT 'pending' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_salaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" varchar(10) NOT NULL,
	"ctc_monthly" numeric(12, 2) DEFAULT '0' NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pf_opt_in" boolean DEFAULT true NOT NULL,
	"esi_opt_in" boolean DEFAULT true NOT NULL,
	"pt_applicable" boolean DEFAULT true NOT NULL,
	"tds_monthly" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_mode" varchar(20) DEFAULT 'bank' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"from_status" "employee_status",
	"to_status" "employee_status" NOT NULL,
	"effective_date" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"from_branch_id" uuid,
	"to_branch_id" uuid NOT NULL,
	"from_department_id" uuid,
	"to_department_id" uuid,
	"transfer_date" timestamp with time zone NOT NULL,
	"reason" text,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"department_id" uuid,
	"designation_id" uuid,
	"reporting_manager_id" uuid,
	"user_id" uuid,
	"employee_code" varchar(40) NOT NULL,
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(80) DEFAULT '' NOT NULL,
	"photo_url" text,
	"gender" varchar(20),
	"date_of_birth" timestamp with time zone,
	"email" varchar(200),
	"mobile" varchar(30),
	"joining_date" timestamp with time zone NOT NULL,
	"employment_type" "employment_type" DEFAULT 'full_time' NOT NULL,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"probation_end_date" timestamp with time zone,
	"exit_date" timestamp with time zone,
	"father_name" varchar(120),
	"mother_name" varchar(120),
	"marital_status" varchar(20),
	"spouse_name" varchar(120),
	"nationality" varchar(60) DEFAULT 'Indian',
	"blood_group" varchar(5),
	"current_address" text,
	"permanent_address" text,
	"country" varchar(100) DEFAULT 'India',
	"state" varchar(100),
	"city" varchar(100),
	"pin_code" varchar(12),
	"emergency_contact_name" varchar(120),
	"emergency_contact_relation" varchar(60),
	"emergency_contact_mobile" varchar(30),
	"pan_number" varchar(20),
	"aadhaar_last4" varchar(4),
	"uan_number" varchar(20),
	"esi_number" varchar(20),
	"device_user_id" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"max_amount" numeric(12, 2),
	"requires_receipt" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"category_id" uuid,
	"title" varchar(150) NOT NULL,
	"description" text,
	"amount" numeric(12, 2) NOT NULL,
	"expense_date" varchar(10) NOT NULL,
	"receipt_url" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejection_reason" text,
	"paid_at" timestamp with time zone,
	"paid_ref" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" varchar(120) NOT NULL,
	"date" varchar(10) NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"type" varchar(20) DEFAULT 'technical' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 45,
	"interviewer_id" uuid,
	"meeting_link" text,
	"location" varchar(120),
	"status" varchar(12) DEFAULT 'scheduled' NOT NULL,
	"feedback" text,
	"rating" integer,
	"recommendation" varchar(12),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"department_id" uuid,
	"designation_id" uuid,
	"title" varchar(150) NOT NULL,
	"description" text,
	"experience_min" integer DEFAULT 0,
	"experience_max" integer,
	"salary_min" numeric(12, 2),
	"salary_max" numeric(12, 2),
	"location" varchar(120),
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"openings" integer DEFAULT 1 NOT NULL,
	"employment_type" varchar(20) DEFAULT 'full_time',
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"allocated" numeric(6, 2) DEFAULT '0' NOT NULL,
	"carried_forward" numeric(6, 2) DEFAULT '0' NOT NULL,
	"adjusted" numeric(6, 2) DEFAULT '0' NOT NULL,
	"used" numeric(6, 2) DEFAULT '0' NOT NULL,
	"encashed" numeric(6, 2) DEFAULT '0' NOT NULL,
	"last_accrued_month" varchar(7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"delta" numeric(6, 2) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"ref_id" uuid,
	"note" text,
	"by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"from_date" varchar(10) NOT NULL,
	"to_date" varchar(10) NOT NULL,
	"half_day" varchar(10),
	"days" numeric(5, 2) NOT NULL,
	"reason" text,
	"contact_during_leave" varchar(60),
	"status" "leave_request_status" DEFAULT 'pending' NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejection_reason" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"code" varchar(10) NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"kind" varchar(20) DEFAULT 'leave' NOT NULL,
	"annual_quota" numeric(6, 2) DEFAULT '0' NOT NULL,
	"accrual" varchar(10) DEFAULT 'yearly' NOT NULL,
	"carry_forward_max" numeric(6, 2) DEFAULT '0' NOT NULL,
	"encashable" boolean DEFAULT false NOT NULL,
	"allow_half_day" boolean DEFAULT true NOT NULL,
	"allow_negative" boolean DEFAULT false NOT NULL,
	"approval_levels" integer DEFAULT 1 NOT NULL,
	"min_notice_days" integer DEFAULT 0 NOT NULL,
	"max_consecutive_days" integer,
	"applicable_genders" jsonb,
	"probation_allowed" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" jsonb DEFAULT '{"enabled":false}'::jsonb NOT NULL,
	"sms" jsonb DEFAULT '{"enabled":false}'::jsonb NOT NULL,
	"whatsapp" jsonb DEFAULT '{"enabled":false}'::jsonb NOT NULL,
	"events" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"user_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"priority" varchar(10) DEFAULT 'info' NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"link" varchar(200),
	"channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"body" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"month" varchar(7) NOT NULL,
	"days_in_month" integer NOT NULL,
	"payable_days" numeric(5, 2) NOT NULL,
	"lop_days" numeric(5, 2) DEFAULT '0' NOT NULL,
	"attendance" jsonb NOT NULL,
	"earnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deductions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"employer" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gross" numeric(12, 2) NOT NULL,
	"total_deductions" numeric(12, 2) NOT NULL,
	"net" numeric(12, 2) NOT NULL,
	"employer_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"bank_snapshot" jsonb,
	"status" varchar(12) DEFAULT 'computed' NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"month" varchar(7) NOT NULL,
	"status" "payroll_status" DEFAULT 'draft' NOT NULL,
	"employee_count" integer DEFAULT 0 NOT NULL,
	"total_gross" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_deductions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_net" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_employer_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"processed_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"cycle_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"type" varchar(10) DEFAULT 'goal' NOT NULL,
	"target_value" numeric(14, 2),
	"current_value" numeric(14, 2) DEFAULT '0',
	"unit" varchar(20),
	"progress" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"due_date" varchar(10),
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"self_rating" integer,
	"self_comments" text,
	"self_submitted_at" timestamp with time zone,
	"manager_rating" integer,
	"manager_comments" text,
	"manager_id" uuid,
	"manager_submitted_at" timestamp with time zone,
	"hr_rating" integer,
	"hr_comments" text,
	"hr_submitted_at" timestamp with time zone,
	"final_rating" numeric(3, 1),
	"status" varchar(16) DEFAULT 'self_pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"ip" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"period_start" varchar(10) NOT NULL,
	"period_end" varchar(10) NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"rating_scale" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"scope" "data_scope" DEFAULT 'own' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" varchar(10) DEFAULT 'advance' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"installment" numeric(12, 2) NOT NULL,
	"recovered" numeric(12, 2) DEFAULT '0' NOT NULL,
	"start_month" varchar(7) NOT NULL,
	"status" varchar(10) DEFAULT 'active' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"code" varchar(20) NOT NULL,
	"type" varchar(12) DEFAULT 'earning' NOT NULL,
	"calc" varchar(20) DEFAULT 'fixed' NOT NULL,
	"default_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"is_taxable" boolean DEFAULT true NOT NULL,
	"is_prorated" boolean DEFAULT true NOT NULL,
	"is_statutory" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" varchar(80) NOT NULL,
	"type" varchar(20) DEFAULT 'general' NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"grace_minutes" integer DEFAULT 10 NOT NULL,
	"min_work_minutes" integer DEFAULT 480 NOT NULL,
	"half_day_minutes" integer DEFAULT 240 NOT NULL,
	"late_after_minutes" integer DEFAULT 10 NOT NULL,
	"early_out_before_minutes" integer DEFAULT 10 NOT NULL,
	"overtime_after_minutes" integer DEFAULT 540 NOT NULL,
	"week_off_days" jsonb DEFAULT '[0]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text,
	"type" varchar(30) DEFAULT 'custom' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"module_key" varchar(40),
	"monthly_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"yearly_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_addons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscription_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid,
	"action" varchar(50) NOT NULL,
	"previous_plan_id" uuid,
	"new_plan_id" uuid,
	"note" text,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid,
	"invoice_number" varchar(30) NOT NULL,
	"plan_name" varchar(100),
	"base_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additional_branch_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additional_employee_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additional_device_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"addons_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_percent" numeric(5, 2) DEFAULT '18' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"reason" varchar(60) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"monthly_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"yearly_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trial_days" integer DEFAULT 14 NOT NULL,
	"included_employees" integer DEFAULT 10 NOT NULL,
	"included_branches" integer DEFAULT 1 NOT NULL,
	"included_devices" integer DEFAULT 1 NOT NULL,
	"included_storage_mb" integer DEFAULT 1024 NOT NULL,
	"additional_branch_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additional_employee_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additional_device_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"billing_cycle" varchar(10) DEFAULT 'monthly' NOT NULL,
	"employee_limit" integer NOT NULL,
	"branch_limit" integer NOT NULL,
	"device_limit" integer NOT NULL,
	"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"base_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additional_branch_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additional_employee_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additional_device_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"addons_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"grace_period_days" integer DEFAULT 7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"employee_id" uuid NOT NULL,
	"category" varchar(20) DEFAULT 'hr' NOT NULL,
	"priority" varchar(10) DEFAULT 'normal' NOT NULL,
	"subject" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"branch_id" uuid,
	"role_id" uuid,
	"type" "user_type" DEFAULT 'company_user' NOT NULL,
	"name" varchar(150) NOT NULL,
	"email" varchar(200) NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_requests" ADD CONSTRAINT "branch_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_requests" ADD CONSTRAINT "branch_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_addons" ADD CONSTRAINT "company_addons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_addons" ADD CONSTRAINT "company_addons_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_addons" ADD CONSTRAINT "company_addons_addon_id_subscription_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."subscription_addons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_employees" ADD CONSTRAINT "device_employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_employees" ADD CONSTRAINT "device_employees_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_employees" ADD CONSTRAINT "device_employees_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_bank_details" ADD CONSTRAINT "employee_bank_details_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_bank_details" ADD CONSTRAINT "employee_bank_details_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shifts" ADD CONSTRAINT "employee_shifts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shifts" ADD CONSTRAINT "employee_shifts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shifts" ADD CONSTRAINT "employee_shifts_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_status_history" ADD CONSTRAINT "employee_status_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_status_history" ADD CONSTRAINT "employee_status_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transfers" ADD CONSTRAINT "employee_transfers_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_designation_id_designations_id_fk" FOREIGN KEY ("designation_id") REFERENCES "public"."designations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewer_id_employees_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_templates" ADD CONSTRAINT "offer_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycle_id_review_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_company_idx" ON "announcements" USING btree ("company_id","publish_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_emp_date_idx" ON "attendance" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "attendance_company_date_idx" ON "attendance" USING btree ("company_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_logs_dedupe_idx" ON "attendance_logs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "attendance_logs_emp_time_idx" ON "attendance_logs" USING btree ("employee_id","punched_at");--> statement-breakpoint
CREATE INDEX "audit_logs_company_idx" ON "audit_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "automation_company_trigger_idx" ON "automation_rules" USING btree ("company_id","trigger");--> statement-breakpoint
CREATE INDEX "branch_requests_company_idx" ON "branch_requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "branches_company_idx" ON "branches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "candidates_job_idx" ON "candidates" USING btree ("job_id","stage");--> statement-breakpoint
CREATE INDEX "company_addons_company_idx" ON "company_addons" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "departments_company_idx" ON "departments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "designations_company_idx" ON "designations" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_employees_idx" ON "device_employees" USING btree ("device_id","employee_id");--> statement-breakpoint
CREATE INDEX "device_employees_uid_idx" ON "device_employees" USING btree ("device_id","device_user_id");--> statement-breakpoint
CREATE INDEX "device_logs_device_idx" ON "device_logs" USING btree ("device_id","created_at");--> statement-breakpoint
CREATE INDEX "devices_company_idx" ON "devices" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_serial_idx" ON "devices" USING btree ("company_id","serial_number");--> statement-breakpoint
CREATE INDEX "employee_docs_employee_idx" ON "employee_documents" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_salaries_emp_idx" ON "employee_salaries" USING btree ("employee_id","effective_from");--> statement-breakpoint
CREATE INDEX "employee_shifts_emp_idx" ON "employee_shifts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employees_company_idx" ON "employees" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employees_branch_idx" ON "employees" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_code_idx" ON "employees" USING btree ("company_id","employee_code");--> statement-breakpoint
CREATE INDEX "expenses_emp_idx" ON "expenses" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "expenses_company_status_idx" ON "expenses" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "holidays_company_date_idx" ON "holidays" USING btree ("company_id","date");--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_balances_idx" ON "leave_balances" USING btree ("employee_id","leave_type_id","year");--> statement-breakpoint
CREATE INDEX "leave_ledger_emp_idx" ON "leave_ledger" USING btree ("employee_id","year");--> statement-breakpoint
CREATE INDEX "leave_requests_emp_idx" ON "leave_requests" USING btree ("employee_id","from_date");--> statement-breakpoint
CREATE INDEX "leave_requests_company_status_idx" ON "leave_requests" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_code_idx" ON "leave_types" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_items_idx" ON "payroll_items" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_items_emp_idx" ON "payroll_items" USING btree ("employee_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_month_idx" ON "payroll_runs" USING btree ("company_id","month","branch_id");--> statement-breakpoint
CREATE INDEX "goals_emp_idx" ON "performance_goals" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_cycle_emp_idx" ON "performance_reviews" USING btree ("cycle_id","employee_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_company_name_idx" ON "roles" USING btree ("company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "salary_components_code_idx" ON "salary_components" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "shifts_company_idx" ON "shifts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoices_company_idx" ON "subscription_invoices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "subscriptions_company_idx" ON "subscriptions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "tickets_company_idx" ON "tickets" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_number_idx" ON "tickets" USING btree ("company_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_company_idx" ON "users" USING btree ("company_id");