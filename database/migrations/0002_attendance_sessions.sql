CREATE TYPE "public"."attendance_break_reason" AS ENUM('inactivity', 'manual', 'lunch', 'personal', 'system');--> statement-breakpoint
CREATE TYPE "public"."attendance_correction_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."attendance_correction_type" AS ENUM('forgot_checkin', 'forgot_checkout', 'wrong_location', 'device_problem', 'network_problem', 'timer_issue', 'other');--> statement-breakpoint
CREATE TYPE "public"."attendance_live_status" AS ENUM('working', 'break', 'offline');--> statement-breakpoint
CREATE TABLE "attendance_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" varchar(10) NOT NULL,
	"type" "attendance_correction_type" NOT NULL,
	"requested_check_in" timestamp with time zone,
	"requested_check_out" timestamp with time zone,
	"reason" text NOT NULL,
	"status" "attendance_correction_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_live" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" "attendance_live_status" DEFAULT 'offline' NOT NULL,
	"break_reason" "attendance_break_reason",
	"since" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD COLUMN "gps_accuracy_m" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD COLUMN "distance_m" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD COLUMN "break_reason" "attendance_break_reason";--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_live" ADD CONSTRAINT "attendance_live_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_live" ADD CONSTRAINT "attendance_live_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_corrections_emp_idx" ON "attendance_corrections" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "attendance_corrections_company_status_idx" ON "attendance_corrections" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "attendance_live_company_status_idx" ON "attendance_live" USING btree ("company_id","status");