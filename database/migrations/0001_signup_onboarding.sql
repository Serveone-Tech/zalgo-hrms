CREATE TYPE "public"."onboarding_status" AS ENUM('signup', 'profile', 'plan', 'payment', 'active');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid,
	"invoice_id" uuid,
	"provider" varchar(20) DEFAULT 'razorpay' NOT NULL,
	"purpose" varchar(20) DEFAULT 'new_subscription' NOT NULL,
	"plan_id" uuid,
	"billing_cycle" varchar(10),
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(5) DEFAULT 'INR' NOT NULL,
	"razorpay_order_id" varchar(80),
	"razorpay_payment_id" varchar(80),
	"razorpay_signature" text,
	"status" varchar(20) DEFAULT 'created' NOT NULL,
	"meta" jsonb,
	"created_by" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "onboarding_status" "onboarding_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "industry" varchar(80);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "company_size" varchar(20);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "source" varchar(40);--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "badge" varchar(30);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_company_idx" ON "payments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("razorpay_order_id");