import { Router } from "express";
import { z } from "zod";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { jobs, candidates, interviews, offerTemplates, employees, departments, designations, branches, companies } from "../../db/schema.js";
import { asyncHandler, validate } from "../../common/handler.js";
import { ok, created } from "../../common/response.js";
import { notFound, badRequest } from "../../common/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
import { requirePermission, requireModule } from "../../middleware/permission.js";
import { audit } from "../../common/audit.js";
import { fullName } from "../employees/employees.service.js";
import { emitToCompany } from "../../sockets.js";
import { notify, userOfEmployee } from "../notifications/notify.service.js";

const r = Router();
r.use(requireAuth, requireTenant, requireModule("recruitment"));
const cid = (req: any) => req.tenant!.companyId as string;
const STAGES = ["applied", "screening", "interview", "selected", "offer_sent", "joined", "rejected"] as const;

// ---- Jobs (78) ----
const jobSchema = z.object({ title: z.string().min(2).max(150), description: z.string().optional(), branchId: z.string().uuid().optional().nullable(), departmentId: z.string().uuid().optional().nullable(), designationId: z.string().uuid().optional().nullable(), experienceMin: z.coerce.number().int().min(0).default(0), experienceMax: z.coerce.number().int().optional().nullable(), salaryMin: z.coerce.number().optional().nullable(), salaryMax: z.coerce.number().optional().nullable(), location: z.string().max(120).optional().nullable(), skills: z.array(z.string()).default([]), openings: z.coerce.number().int().min(1).default(1), employmentType: z.string().default("full_time"), status: z.enum(["draft", "open", "on_hold", "closed"]).default("open") });
const jobRow = (b: any) => ({ ...b, salaryMin: b.salaryMin != null ? String(b.salaryMin) : b.salaryMin, salaryMax: b.salaryMax != null ? String(b.salaryMax) : b.salaryMax });
r.get("/jobs", requirePermission("recruitment.view"), asyncHandler(async (req, res) => {
  ok(res, await db.select({ ...jobs as any, departmentName: departments.name, designationName: designations.name, branchName: branches.name, candidateCount: sql<number>`(select count(*) from ${candidates} where ${candidates.jobId} = ${jobs.id})`.mapWith(Number), joinedCount: sql<number>`(select count(*) from ${candidates} where ${candidates.jobId} = ${jobs.id} and ${candidates.stage} = 'joined')`.mapWith(Number) }).from(jobs).leftJoin(departments, eq(departments.id, jobs.departmentId)).leftJoin(designations, eq(designations.id, jobs.designationId)).leftJoin(branches, eq(branches.id, jobs.branchId)).where(eq(jobs.companyId, cid(req))).orderBy(desc(jobs.createdAt)));
}));
r.post("/jobs", requirePermission("recruitment.manage"), validate(jobSchema), asyncHandler(async (req, res) => { const [row] = await db.insert(jobs).values({ ...jobRow(req.body), companyId: cid(req), createdBy: req.user!.id }).returning(); audit(req, "create", "job", row.id, { title: row.title }); created(res, row, "Job created"); }));
r.put("/jobs/:id", requirePermission("recruitment.manage"), validate(jobSchema.partial()), asyncHandler(async (req, res) => { const [row] = await db.update(jobs).set({ ...jobRow(req.body), updatedAt: new Date() }).where(and(eq(jobs.id, req.params.id), eq(jobs.companyId, cid(req)))).returning(); if (!row) throw notFound("Job not found"); audit(req, "update", "job", row.id); ok(res, row, "Job updated"); }));
r.get("/jobs/:id", requirePermission("recruitment.view"), asyncHandler(async (req, res) => {
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, req.params.id), eq(jobs.companyId, cid(req)))).limit(1); if (!job) throw notFound("Job not found");
  const cands = await db.select().from(candidates).where(eq(candidates.jobId, job.id)).orderBy(desc(candidates.updatedAt));
  const byStage = STAGES.map((s) => ({ stage: s, n: cands.filter((c) => c.stage === s).length }));
  ok(res, { ...job, candidates: cands, byStage });
}));

// ---- Candidates (79–80) ----
const candSchema = z.object({ name: z.string().min(2).max(150), email: z.string().email().optional().or(z.literal("")).nullable(), mobile: z.string().max(30).optional().nullable(), resumeUrl: z.string().url().optional().or(z.literal("")).nullable(), skills: z.array(z.string()).default([]), experienceYears: z.coerce.number().min(0).optional().nullable(), education: z.string().max(200).optional().nullable(), currentCompany: z.string().max(150).optional().nullable(), currentCtc: z.coerce.number().optional().nullable(), expectedCtc: z.coerce.number().optional().nullable(), noticeDays: z.coerce.number().int().optional().nullable(), source: z.string().max(40).optional().nullable(), notes: z.string().optional().nullable(), rating: z.coerce.number().int().min(1).max(5).optional().nullable() });
const candRow = (b: any) => { const o: any = { ...b }; for (const k of ["experienceYears", "currentCtc", "expectedCtc"]) if (o[k] != null) o[k] = String(o[k]); if (o.email === "") o.email = null; if (o.resumeUrl === "") o.resumeUrl = null; return o; };
r.post("/jobs/:id/candidates", requirePermission("recruitment.manage"), validate(candSchema), asyncHandler(async (req, res) => {
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, req.params.id), eq(jobs.companyId, cid(req)))).limit(1); if (!job) throw notFound("Job not found");
  const [row] = await db.insert(candidates).values({ ...candRow(req.body), companyId: cid(req), jobId: job.id }).returning();
  audit(req, "create", "candidate", row.id, { name: row.name, job: job.title }); created(res, row, "Candidate added");
}));
async function loadCand(req: any, id: string) { const [c] = await db.select().from(candidates).where(and(eq(candidates.id, id), eq(candidates.companyId, cid(req)))).limit(1); if (!c) throw notFound("Candidate not found"); return c; }
r.get("/candidates/:id", requirePermission("recruitment.view"), asyncHandler(async (req, res) => {
  const c = await loadCand(req, req.params.id);
  const iv = await db.select({ ...interviews as any, interviewerName: fullName }).from(interviews).leftJoin(employees, eq(employees.id, interviews.interviewerId)).where(eq(interviews.candidateId, c.id)).orderBy(interviews.round);
  const [job] = await db.select().from(jobs).where(eq(jobs.id, c.jobId)).limit(1);
  ok(res, { ...c, interviews: iv, job });
}));
r.put("/candidates/:id", requirePermission("recruitment.manage"), validate(candSchema.partial()), asyncHandler(async (req, res) => { const c = await loadCand(req, req.params.id); const [row] = await db.update(candidates).set({ ...candRow(req.body), updatedAt: new Date() }).where(eq(candidates.id, c.id)).returning(); ok(res, row, "Candidate updated"); }));
r.post("/candidates/:id/stage", requirePermission("recruitment.manage"), validate(z.object({ stage: z.enum(STAGES), rejectionReason: z.string().optional() })), asyncHandler(async (req, res) => {
  const c = await loadCand(req, req.params.id); const b = req.body as { stage: typeof STAGES[number]; rejectionReason?: string };
  if (b.stage === "joined" && !c.employeeId) throw badRequest("Use 'Convert to employee' to mark as joined");
  const [row] = await db.update(candidates).set({ stage: b.stage, rejectionReason: b.stage === "rejected" ? b.rejectionReason : null, updatedAt: new Date() }).where(eq(candidates.id, c.id)).returning();
  audit(req, "stage", "candidate", c.id, { from: c.stage, to: b.stage }); ok(res, row, `Moved to ${b.stage.replace("_", " ")}`);
}));
// ---- Interviews (81) ----
r.post("/candidates/:id/interviews", requirePermission("recruitment.manage"), validate(z.object({ round: z.coerce.number().int().min(1).default(1), type: z.enum(["telephonic", "technical", "hr", "final"]).default("technical"), scheduledAt: z.coerce.date(), durationMin: z.coerce.number().int().default(45), interviewerId: z.string().uuid().optional().nullable(), meetingLink: z.string().optional().nullable(), location: z.string().optional().nullable() })), asyncHandler(async (req, res) => {
  const c = await loadCand(req, req.params.id);
  const [row] = await db.insert(interviews).values({ ...(req.body as any), companyId: cid(req), candidateId: c.id }).returning();
  if (c.stage === "applied" || c.stage === "screening") await db.update(candidates).set({ stage: "interview", updatedAt: new Date() }).where(eq(candidates.id, c.id));
  emitToCompany(cid(req), "interview:scheduled", { candidate: c.name, at: row.scheduledAt, interviewerId: row.interviewerId });
  if (row.interviewerId) { const u = await userOfEmployee(row.interviewerId); if (u?.userId) await notify({ companyId: cid(req), userIds: [u.userId], type: "interview.scheduled", title: `Interview: ${c.name} (round ${row.round}, ${row.type})`, body: `${row.scheduledAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}${row.meetingLink ? " · " + row.meetingLink : ""}`, link: "/app/recruitment" }); }
  audit(req, "schedule", "interview", row.id, { candidate: c.name }); created(res, row, "Interview scheduled");
}));
r.post("/interviews/:id/feedback", requirePermission("recruitment.view"), validate(z.object({ status: z.enum(["completed", "cancelled", "no_show"]).default("completed"), feedback: z.string().optional(), rating: z.coerce.number().int().min(1).max(5).optional().nullable(), recommendation: z.enum(["hire", "no_hire", "hold"]).optional().nullable() })), asyncHandler(async (req, res) => {
  const [row] = await db.update(interviews).set(req.body as any).where(and(eq(interviews.id, req.params.id), eq(interviews.companyId, cid(req)))).returning(); if (!row) throw notFound("Interview not found");
  audit(req, "feedback", "interview", row.id, { recommendation: row.recommendation }); ok(res, row, "Feedback saved");
}));
// ---- Offer letters (82) ----
const DEFAULT_TEMPLATE = `Dear {{candidate_name}},

We are pleased to offer you the position of {{designation}} at {{company_name}}, {{location}}.

Your date of joining will be {{joining_date}} and your annual CTC will be ₹{{salary}}.

This offer is valid until {{offer_valid_till}}. Please sign and return a copy to confirm your acceptance.

We look forward to welcoming you to the team.

Warm regards,
{{hr_name}}
{{company_name}}`;
r.get("/offer-templates", requirePermission("recruitment.view"), asyncHandler(async (req, res) => { ok(res, { templates: await db.select().from(offerTemplates).where(eq(offerTemplates.companyId, cid(req))), variables: ["candidate_name", "designation", "company_name", "location", "joining_date", "salary", "offer_valid_till", "hr_name", "department"], sample: DEFAULT_TEMPLATE }); }));
r.post("/offer-templates", requirePermission("recruitment.manage"), validate(z.object({ name: z.string().min(2), body: z.string().min(10), isDefault: z.boolean().default(false) })), asyncHandler(async (req, res) => { const b = req.body as any; if (b.isDefault) await db.update(offerTemplates).set({ isDefault: false }).where(eq(offerTemplates.companyId, cid(req))); const [row] = await db.insert(offerTemplates).values({ ...b, companyId: cid(req) }).returning(); created(res, row, "Template saved"); }));
r.put("/offer-templates/:id", requirePermission("recruitment.manage"), validate(z.object({ name: z.string().min(2).optional(), body: z.string().min(10).optional(), isDefault: z.boolean().optional() })), asyncHandler(async (req, res) => { const b = req.body as any; if (b.isDefault) await db.update(offerTemplates).set({ isDefault: false }).where(eq(offerTemplates.companyId, cid(req))); const [row] = await db.update(offerTemplates).set({ ...b, updatedAt: new Date() }).where(and(eq(offerTemplates.id, req.params.id), eq(offerTemplates.companyId, cid(req)))).returning(); if (!row) throw notFound("Template not found"); ok(res, row, "Template updated"); }));
r.post("/candidates/:id/offer", requirePermission("recruitment.manage"), validate(z.object({ templateId: z.string().uuid().optional().nullable(), designation: z.string(), joiningDate: z.string(), salary: z.coerce.number(), location: z.string().optional(), offerValidTill: z.string().optional(), department: z.string().optional() })), asyncHandler(async (req, res) => {
  const c = await loadCand(req, req.params.id); const b = req.body as any;
  const [co] = await db.select().from(companies).where(eq(companies.id, cid(req))).limit(1);
  let body = DEFAULT_TEMPLATE;
  if (b.templateId) { const [t] = await db.select().from(offerTemplates).where(and(eq(offerTemplates.id, b.templateId), eq(offerTemplates.companyId, cid(req)))).limit(1); if (t) body = t.body; }
  else { const [t] = await db.select().from(offerTemplates).where(and(eq(offerTemplates.companyId, cid(req)), eq(offerTemplates.isDefault, true))).limit(1); if (t) body = t.body; }
  const vars: Record<string, string> = { candidate_name: c.name, designation: b.designation, company_name: co.name, location: b.location ?? co.city ?? "", joining_date: b.joiningDate, salary: Number(b.salary).toLocaleString("en-IN"), offer_valid_till: b.offerValidTill ?? "", hr_name: req.user!.name, department: b.department ?? "" };
  const letter = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? "");
  const [row] = await db.update(candidates).set({ offerLetter: letter, offerSentAt: new Date(), stage: "offer_sent", updatedAt: new Date() }).where(eq(candidates.id, c.id)).returning();
  audit(req, "offer", "candidate", c.id, { designation: b.designation, salary: b.salary }); ok(res, row, "Offer letter generated");
}));
// ---- Convert to employee ----
r.post("/candidates/:id/convert", requirePermission("recruitment.manage"), validate(z.object({ branchId: z.string().uuid(), joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), designationId: z.string().uuid().optional().nullable(), departmentId: z.string().uuid().optional().nullable() })), asyncHandler(async (req, res) => {
  const c = await loadCand(req, req.params.id); const b = req.body as any;
  if (c.employeeId) throw badRequest("Already converted");
  const { assertEmployeeCapacity, nextEmployeeCode } = await import("../employees/employees.service.js");
  await assertEmployeeCapacity(cid(req), req.tenant!.limits.employees);
  const [first, ...rest] = c.name.trim().split(/\s+/);
  const [emp] = await db.insert(employees).values({ companyId: cid(req), branchId: b.branchId, designationId: b.designationId ?? null, departmentId: b.departmentId ?? null, employeeCode: await nextEmployeeCode(cid(req)), firstName: first, lastName: rest.join(" "), email: c.email, mobile: c.mobile, joiningDate: new Date(b.joiningDate), status: "probation" }).returning();
  await db.update(candidates).set({ stage: "joined", employeeId: emp.id, updatedAt: new Date() }).where(eq(candidates.id, c.id));
  audit(req, "convert", "candidate", c.id, { employeeId: emp.id }); ok(res, emp, `${c.name} added as employee ${emp.employeeCode}`);
}));
r.get("/stats", requirePermission("recruitment.view"), asyncHandler(async (req, res) => {
  const [{ openJobs }] = await db.select({ openJobs: count() }).from(jobs).where(and(eq(jobs.companyId, cid(req)), eq(jobs.status, "open")));
  const pipeline = await db.select({ stage: candidates.stage, n: count() }).from(candidates).where(eq(candidates.companyId, cid(req))).groupBy(candidates.stage);
  ok(res, { openJobs, pipeline });
}));
export default r;
