import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGet, useAction } from "@/lib/queries";
import { Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { EMP_TYPE, type Branch, type Dept, type Desig, type EmployeeDetail } from "./types";

const s = z.string().optional().nullable();
const schema = z.object({
  employeeCode: s, firstName: z.string().min(1, "Required"), lastName: z.string().optional().default(""), gender: s, dateOfBirth: s, email: z.string().email().optional().or(z.literal("")).nullable(), mobile: s,
  branchId: z.string().min(1, "Select branch"), departmentId: s, designationId: s, reportingManagerId: s, joiningDate: z.string().min(1, "Required"),
  employmentType: z.string(), status: z.string().optional(), probationEndDate: s,
  fatherName: s, motherName: s, maritalStatus: s, spouseName: s, nationality: s, bloodGroup: s,
  currentAddress: s, permanentAddress: s, country: s, state: s, city: s, pinCode: s,
  emergencyContactName: s, emergencyContactRelation: s, emergencyContactMobile: s,
  panNumber: s, aadhaarLast4: s, uanNumber: s, esiNumber: s, deviceUserId: s,
  loginEmail: z.string().optional(), loginPassword: z.string().optional(), loginRoleId: z.string().optional(),
});
type Form = z.infer<typeof schema>;
const d = (v?: string | null) => (v ? v.slice(0, 10) : "");

export function EmployeeForm({ employee, onDone }: { employee?: EmployeeDetail; onDone: (id?: string) => void }) {
  const branches = useGet<Branch[]>(["branches"], "/branches");
  const depts = useGet<Dept[]>(["departments"], "/departments");
  const desigs = useGet<Desig[]>(["designations"], "/designations");
  const managers = useGet<{ id: string; name: string; employeeCode: string }[]>(["managers"], "/employees/managers");
  const rolesQ = useGet<{ id: string; name: string }[]>(["roles"], "/roles", !employee);
  const act = useAction<any, { id: string }>([["employees"], ["employee", employee?.id], ["company-dashboard"], ["managers"]]);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: employee ? { ...employee, dateOfBirth: d(employee.dateOfBirth), joiningDate: d(employee.joiningDate), probationEndDate: d(employee.probationEndDate) } as any
      : { employmentType: "full_time", status: "active", joiningDate: new Date().toISOString().slice(0, 10), nationality: "Indian", country: "India" },
  });
  const wantLogin = !!watch("loginEmail");
  const submit = (v: Form) => {
    const { loginEmail, loginPassword, loginRoleId, ...rest } = v;
    const body: any = { ...rest };
    for (const k of Object.keys(body)) if (body[k] === "" && !["lastName"].includes(k)) body[k] = null;
    if (!employee && loginEmail) body.createLogin = { email: loginEmail, password: loginPassword, roleId: loginRoleId };
    if (employee) { delete body.status; delete body.branchId; }
    act.mutate({ method: employee ? "put" : "post", url: employee ? `/employees/${employee.id}` : "/employees", body }, { onSuccess: (r) => onDone(r.data?.id) });
  };
  const T = (n: keyof Form, label: string, type = "text", cls?: string) => <Field label={label} error={(errors as any)[n]?.message} className={cls}><input className="field" type={type} {...register(n)} /></Field>;
  const Sec = ({ t, children }: { t: string; children: React.ReactNode }) => <div className="border-t border-line pt-4 first:border-0 first:pt-0"><h3 className="font-bold text-sm mb-3">{t}</h3><div className="grid sm:grid-cols-3 gap-4">{children}</div></div>;

  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="space-y-5">
      <Sec t="Basic">
        {T("firstName", "First name")}{T("lastName", "Last name")}{T("employeeCode", "Employee code (auto if blank)")}
        <Field label="Gender"><select className="field" {...register("gender")}><option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></Field>
        {T("dateOfBirth", "Date of birth", "date")}{T("email", "Email", "email")}{T("mobile", "Mobile")}{T("bloodGroup", "Blood group")}
      </Sec>
      <Sec t="Employment">
        {!employee && <Field label="Branch" error={errors.branchId?.message}><select className="field" {...register("branchId")}><option value="">Select…</option>{branches.data?.data?.filter((b) => b.status === "active").map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
        <Field label="Department"><select className="field" {...register("departmentId")}><option value="">—</option>{depts.data?.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Designation"><select className="field" {...register("designationId")}><option value="">—</option>{desigs.data?.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Reporting manager"><select className="field" {...register("reportingManagerId")}><option value="">—</option>{managers.data?.data?.filter((m) => m.id !== employee?.id).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.employeeCode})</option>)}</select></Field>
        {T("joiningDate", "Joining date", "date")}
        <Field label="Employment type"><select className="field" {...register("employmentType")}>{Object.entries(EMP_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {!employee && <Field label="Initial status"><select className="field" {...register("status")}><option value="active">Active</option><option value="probation">Probation</option></select></Field>}
        {T("probationEndDate", "Probation end", "date")}{T("deviceUserId", "Biometric device user ID")}
      </Sec>
      <Sec t="Personal">{T("fatherName", "Father's name")}{T("motherName", "Mother's name")}<Field label="Marital status"><select className="field" {...register("maritalStatus")}><option value="">—</option><option>Single</option><option>Married</option><option>Other</option></select></Field>{T("spouseName", "Spouse name")}{T("nationality", "Nationality")}</Sec>
      <Sec t="Address">{T("currentAddress", "Current address", "text", "sm:col-span-3")}{T("permanentAddress", "Permanent address", "text", "sm:col-span-3")}{T("city", "City")}{T("state", "State")}{T("pinCode", "PIN code")}</Sec>
      <Sec t="Emergency contact">{T("emergencyContactName", "Name")}{T("emergencyContactRelation", "Relation")}{T("emergencyContactMobile", "Mobile")}</Sec>
      <Sec t="Statutory IDs">{T("panNumber", "PAN")}{T("aadhaarLast4", "Aadhaar (last 4 digits only)")}{T("uanNumber", "UAN (PF)")}{T("esiNumber", "ESI number")}</Sec>
      {!employee && <Sec t="Self-service login (optional)">
        {T("loginEmail", "Login email", "email")}
        <Field label="Password"><input className="field" type="text" autoComplete="off" disabled={!wantLogin} {...register("loginPassword")} /></Field>
        <Field label="Role"><select className="field" disabled={!wantLogin} {...register("loginRoleId")}><option value="">Select…</option>{rolesQ.data?.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      </Sec>}
      <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={act.isPending}>{employee ? "Save changes" : "Add employee"}</Button></div>
    </form>
  );
}
