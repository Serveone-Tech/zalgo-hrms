import { z } from "zod";
const opt = z.string().max(200).optional().nullable();
const date = z.coerce.date().optional().nullable();
export const employeeSchema = z.object({
  employeeCode: z.string().min(1).max(40).optional(),
  firstName: z.string().min(1).max(80), lastName: z.string().max(80).default(""),
  photoUrl: z.string().url().optional().nullable().or(z.literal("")),
  gender: z.enum(["male", "female", "other"]).optional().nullable(), dateOfBirth: date,
  email: z.string().email().optional().nullable().or(z.literal("")), mobile: opt,
  branchId: z.string().uuid(), departmentId: z.string().uuid().optional().nullable(), designationId: z.string().uuid().optional().nullable(),
  reportingManagerId: z.string().uuid().optional().nullable(),
  joiningDate: z.coerce.date(),
  employmentType: z.enum(["full_time", "part_time", "intern", "contract", "freelancer", "consultant"]).default("full_time"),
  status: z.enum(["active", "inactive", "probation", "notice_period", "resigned", "terminated"]).default("active"),
  probationEndDate: date,
  fatherName: opt, motherName: opt, maritalStatus: opt, spouseName: opt, nationality: opt, bloodGroup: z.string().max(5).optional().nullable(),
  currentAddress: opt, permanentAddress: opt, country: opt, state: opt, city: opt, pinCode: z.string().max(12).optional().nullable(),
  emergencyContactName: opt, emergencyContactRelation: opt, emergencyContactMobile: opt,
  panNumber: z.string().max(20).optional().nullable(), aadhaarLast4: z.string().regex(/^\d{4}$/).optional().nullable().or(z.literal("")), uanNumber: opt, esiNumber: opt,
  deviceUserId: z.string().max(40).optional().nullable(),
  createLogin: z.object({ email: z.string().email(), password: z.string().min(8), roleId: z.string().uuid() }).optional(),
});
export const bankSchema = z.object({ bankName: opt, accountHolder: opt, accountNumber: z.string().max(40).optional().nullable(), ifsc: z.string().max(15).optional().nullable(), branchName: opt, upiId: opt });
export const transferSchema = z.object({ toBranchId: z.string().uuid(), toDepartmentId: z.string().uuid().optional().nullable(), transferDate: z.coerce.date(), reason: z.string().optional() });
export const statusSchema = z.object({ status: z.enum(["active", "inactive", "probation", "notice_period", "resigned", "terminated"]), effectiveDate: z.coerce.date().optional(), note: z.string().optional() });
