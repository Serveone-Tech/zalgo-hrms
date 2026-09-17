import { z } from "zod";

// Mirrors apps/backend/src/modules/companies/company.schema.ts — Super Admin "New company"
// and the self-service onboarding wizard must collect identical fields.
export const companyProfileSchema = z.object({
  name: z.string().min(2, "Company name is required").max(200),
  slug: z.string().max(120).regex(/^[a-z0-9-]*$/, "lowercase letters, numbers, dashes").optional().or(z.literal("")),
  industry: z.string().max(80).optional().or(z.literal("")),
  companySize: z.enum(["1-10", "11-50", "51-200", "201-500", "500+"]).optional().or(z.literal("")),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  mobile: z.string().max(30).optional().or(z.literal("")),
  website: z.string().max(200).optional().or(z.literal("")),
  gstNumber: z.string().max(30).optional().or(z.literal("")),
  panNumber: z.string().max(20).optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  country: z.string().default("India"),
  state: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  pinCode: z.string().max(12).optional().or(z.literal("")),
  timezone: z.string().default("Asia/Kolkata"),
});
export type CompanyProfileForm = z.infer<typeof companyProfileSchema>;

export const headOfficeSchema = z.object({
  name: z.string().min(2, "Head office name is required").default("Head Office"),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  pinCode: z.string().max(12).optional().or(z.literal("")),
});
export type HeadOfficeForm = z.infer<typeof headOfficeSchema>;

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;
export const INDUSTRIES = ["IT / Software", "Manufacturing", "Retail", "Healthcare", "Education", "Finance", "Logistics", "Hospitality", "Construction", "Other"];
