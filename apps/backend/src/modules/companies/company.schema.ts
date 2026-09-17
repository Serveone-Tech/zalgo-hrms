import { z } from "zod";

// Shared by Super Admin "New company" form and the self-service onboarding wizard —
// both paths must collect identical company profile data (CLAUDE.md rule: single source of truth).
export const companyProfileSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().max(120).regex(/^[a-z0-9-]*$/, "lowercase letters, numbers, dashes").optional().or(z.literal("")),
  industry: z.string().max(80).optional().or(z.literal("")),
  companySize: z.enum(["1-10", "11-50", "51-200", "201-500", "500+"]).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
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
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

export const headOfficeSchema = z.object({
  name: z.string().min(2).max(150).default("Head Office"),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  pinCode: z.string().max(12).optional().or(z.literal("")),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});
export type HeadOfficeInput = z.infer<typeof headOfficeSchema>;

export const onboardingProfileSchema = z.object({
  company: companyProfileSchema,
  headOffice: headOfficeSchema,
});
