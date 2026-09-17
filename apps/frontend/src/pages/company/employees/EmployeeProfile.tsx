import { useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useGet, useAction } from "@/lib/queries";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/ui/toast";
import { PageHeader, Loading, Field, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { fmtDate, daysLeft, cn } from "@/lib/utils";
import { EmployeeForm } from "./EmployeeForm";
import { Avatar } from "./Employees";
import { STATUS_LABEL, EMP_TYPE, DOC_TYPES, type EmployeeDetail, type Branch, type Dept } from "./types";
import { EmployeeMonth } from "../attendance/EmployeeMonth";
import { EmployeeLeave } from "../leaves/EmployeeLeave";
import { SalaryTab } from "../payroll/SalaryTab";
import { GoalsPanel } from "../hr/Performance";
import { useAuth as useAuthStore } from "@/store/auth";

const tabs = ["Overview", "Personal", "Bank", "Salary", "Documents", "Attendance", "Leave", "Goals", "History"] as const;
const Row = ({ l, v }: { l: string; v?: React.ReactNode }) => <div className="flex justify-between gap-4 py-2 text-sm border-b border-line/60 last:border-0"><dt className="text-muted">{l}</dt><dd className="text-right font-medium">{v || "—"}</dd></div>;

export default function EmployeeProfile() {
  const { id } = useParams(); const nav = useNavigate(); const qc = useQueryClient(); const { toast } = useToast();
  const can = useAuth((s) => s.can);
  const { data, isLoading } = useGet<EmployeeDetail>(["employee", id], `/employees/${id}`);
  const branches = useGet<Branch[]>(["branches"], "/branches"); const depts = useGet<Dept[]>(["departments"], "/departments");
  const act = useAction([["employee", id], ["employees"], ["company-dashboard"]]);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [edit, setEdit] = useState(false); const [statusM, setStatusM] = useState<{ status: string; note: string; effectiveDate: string } | null>(null);
  const [transfer, setTransfer] = useState<{ toBranchId: string; toDepartmentId: string; transferDate: string; reason: string } | null>(null);
  const [docM, setDocM] = useState(false); const fileRef = useRef<HTMLInputElement>(null); const [docMeta, setDocMeta] = useState({ type: "other", title: "", expiryDate: "" }); const [uploading, setUploading] = useState(false);
  const bank = useForm<Record<string, string>>();
  if (isLoading || !data?.data) return <Loading />;
  const e = data.data;
  const bname = (bid?: string | null) => branches.data?.data?.find((b) => b.id === bid)?.name ?? "—";

  const uploadDoc = async () => {
    const f = fileRef.current?.files?.[0]; if (!f) return toast("Choose a file", "error");
    const fd = new FormData(); fd.append("file", f); fd.append("type", docMeta.type); fd.append("title", docMeta.title || f.name); if (docMeta.expiryDate) fd.append("expiryDate", docMeta.expiryDate);
    setUploading(true);
    try { await api.post(`/employees/${e.id}/documents`, fd); toast("Document uploaded"); qc.invalidateQueries({ queryKey: ["employee", id] }); setDocM(false); setDocMeta({ type: "other", title: "", expiryDate: "" }); }
    catch (err) { toast(errMsg(err), "error"); } finally { setUploading(false); }
  };
  const openDoc = async (docId: string) => {
    try { const { data: r } = await api.get(`/employees/${e.id}/documents/${docId}/url`); window.open(`${import.meta.env.VITE_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:5000"}${r.data.url}`, "_blank"); }
    catch (err) { toast(errMsg(err), "error"); }
  };

  return (
    <>
      <Link to="/app/employees" className="text-sm text-muted hover:text-ink">← Employees</Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mt-2 mb-6">
        <div className="flex items-center gap-4"><Avatar e={e} size={14} /><div><h1 className="text-2xl font-extrabold tracking-tight">{e.name}</h1><p className="text-sm text-muted">{e.employeeCode} · {e.designationName ?? "No designation"} · {e.departmentName ?? "No department"} · {e.branchName}</p><div className="mt-1.5 flex gap-2"><Badge status={e.status}>{STATUS_LABEL[e.status]}</Badge><Badge>{EMP_TYPE[e.employmentType]}</Badge></div></div></div>
        {can("employee.update") && <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEdit(true)}>Edit</Button>
          <Button variant="secondary" size="sm" onClick={() => setTransfer({ toBranchId: "", toDepartmentId: e.departmentId ?? "", transferDate: new Date().toISOString().slice(0, 10), reason: "" })}>Transfer</Button>
          <Button variant="secondary" size="sm" onClick={() => setStatusM({ status: e.status, note: "", effectiveDate: new Date().toISOString().slice(0, 10) })}>Change status</Button>
        </div>}
      </div>
      <div className="flex gap-1 border-b border-line mb-5">{tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={cn("px-3 py-2 text-sm font-semibold border-b-2 -mb-px", tab === t ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink")}>{t}{t === "Documents" && e.documents.length ? ` (${e.documents.length})` : ""}</button>)}</div>

      {tab === "Overview" && <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5"><h3 className="font-bold mb-2">Contact</h3><dl><Row l="Email" v={e.email} /><Row l="Mobile" v={e.mobile} /><Row l="Login" v={e.userId ? <Badge status="active">Enabled</Badge> : "No login"} /><Row l="Device user ID" v={e.deviceUserId} /></dl></div>
        <div className="card p-5"><h3 className="font-bold mb-2">Employment</h3><dl><Row l="Joined" v={fmtDate(e.joiningDate)} /><Row l="Reports to" v={e.managerName} /><Row l="Probation ends" v={fmtDate(e.probationEndDate)} /><Row l="Exit date" v={fmtDate(e.exitDate)} /></dl></div>
        <div className="card p-5"><h3 className="font-bold mb-2">Direct reports ({e.reports.length})</h3>{e.reports.length ? <ul className="text-sm space-y-1.5">{e.reports.map((r) => <li key={r.id}><Link to={`/app/employees/${r.id}`} className="font-medium hover:text-brand">{r.name}</Link> <span className="text-muted">{r.designationName ?? ""}</span></li>)}</ul> : <p className="text-sm text-muted">No one reports to {e.firstName}.</p>}</div>
      </div>}
      {tab === "Personal" && <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5"><h3 className="font-bold mb-2">Personal</h3><dl><Row l="Date of birth" v={fmtDate(e.dateOfBirth)} /><Row l="Gender" v={e.gender} /><Row l="Blood group" v={e.bloodGroup} /><Row l="Father" v={e.fatherName} /><Row l="Mother" v={e.motherName} /><Row l="Marital status" v={e.maritalStatus} /><Row l="Spouse" v={e.spouseName} /><Row l="Nationality" v={e.nationality} /></dl></div>
        <div className="card p-5"><h3 className="font-bold mb-2">Address</h3><dl><Row l="Current" v={e.currentAddress} /><Row l="Permanent" v={e.permanentAddress} /><Row l="City / State" v={[e.city, e.state].filter(Boolean).join(", ")} /><Row l="PIN" v={e.pinCode} /></dl><h3 className="font-bold mb-2 mt-5">Emergency contact</h3><dl><Row l="Name" v={e.emergencyContactName} /><Row l="Relation" v={e.emergencyContactRelation} /><Row l="Mobile" v={e.emergencyContactMobile} /></dl></div>
        <div className="card p-5"><h3 className="font-bold mb-2">Statutory</h3><dl><Row l="PAN" v={e.panNumber} /><Row l="Aadhaar" v={e.aadhaarLast4 ? `XXXX XXXX ${e.aadhaarLast4}` : null} /><Row l="UAN" v={e.uanNumber} /><Row l="ESI" v={e.esiNumber} /></dl></div>
      </div>}
      {tab === "Bank" && <form className="card p-5 max-w-2xl space-y-4" onSubmit={bank.handleSubmit((v) => act.mutate({ method: "put", url: `/employees/${e.id}/bank`, body: v }))}>
        <h3 className="font-bold">Bank details <span className="text-xs text-muted font-normal">(used by payroll)</span></h3>
        <div className="grid sm:grid-cols-2 gap-4">{[["bankName", "Bank name"], ["accountHolder", "Account holder"], ["accountNumber", "Account number"], ["ifsc", "IFSC"], ["branchName", "Branch"], ["upiId", "UPI ID"]].map(([k, l]) => <Field key={k} label={l}><input className="field" defaultValue={e.bank?.[k] ?? ""} {...bank.register(k)} disabled={!can("employee.update")} /></Field>)}</div>
        {can("employee.update") && <div className="flex justify-end"><Button type="submit" loading={act.isPending}>Save bank details</Button></div>}
      </form>}
      {tab === "Salary" && (useAuthStore.getState().hasModule("payroll") ? (can("payroll.view") ? <SalaryTab employeeId={e.id} /> : <Empty text="You don't have payroll permission." />) : <Empty text="Payroll module is not in your plan." />)}
      {tab === "Documents" && <>
        {can("employee.update") && <div className="flex justify-end mb-3"><Button size="sm" onClick={() => setDocM(true)}>Upload document</Button></div>}
        {!e.documents.length ? <Empty text="No documents uploaded." /> : <div className="card overflow-x-auto"><table className="w-full min-w-[640px]">
          <thead><tr><th className="th">Document</th><th className="th">Type</th><th className="th">Expiry</th><th className="th">Verification</th><th className="th"></th></tr></thead>
          <tbody>{e.documents.map((d) => { const dl = daysLeft(d.expiryDate); return <tr key={d.id}>
            <td className="td"><button className="font-semibold hover:text-brand" onClick={() => openDoc(d.id)}>{d.title}</button><div className="text-xs text-muted">{d.fileName} · {((d.sizeBytes ?? 0) / 1024).toFixed(0)} KB · {fmtDate(d.createdAt)}</div></td>
            <td className="td">{DOC_TYPES[d.type] ?? d.type}</td>
            <td className="td">{d.expiryDate ? <span className={dl <= 30 ? "text-warn font-semibold" : ""}>{fmtDate(d.expiryDate)}{dl <= 30 && dl > 0 ? ` (${dl}d)` : dl <= 0 ? " (expired)" : ""}</span> : "—"}</td>
            <td className="td"><Badge status={d.verification === "verified" ? "active" : d.verification === "rejected" ? "rejected" : "pending"}>{d.verification}</Badge></td>
            <td className="td text-right whitespace-nowrap">{can("employee.update") && <>{d.verification !== "verified" && <Button size="sm" variant="ghost" onClick={() => act.mutate({ url: `/employees/${e.id}/documents/${d.id}/verify`, body: { verification: "verified" } })}>Verify</Button>}<Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm("Delete document?") && act.mutate({ method: "delete", url: `/employees/${e.id}/documents/${d.id}` })}>Delete</Button></>}</td>
          </tr>; })}</tbody></table></div>}
      </>}
      {tab === "Attendance" && (useAuthStore.getState().hasModule("attendance") ? <EmployeeMonth employeeId={e.id} /> : <Empty text="Attendance module is not in your plan." />)}
      {tab === "Leave" && (useAuthStore.getState().hasModule("leaves") ? <EmployeeLeave employeeId={e.id} /> : <Empty text="Leave module is not in your plan." />)}
      {tab === "Goals" && (useAuthStore.getState().hasModule("performance") ? <GoalsPanel employeeId={e.id} canEdit={can("performance.manage")} /> : <Empty text="Performance module is not in your plan." />)}
      {tab === "History" && <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5"><h3 className="font-bold mb-3">Status history</h3><ol className="space-y-3 text-sm">{e.history.map((h) => <li key={h.id} className="flex gap-3"><span className="text-muted whitespace-nowrap w-24">{fmtDate(h.effectiveDate)}</span><span>{h.fromStatus ? `${STATUS_LABEL[h.fromStatus]} → ` : ""}<b>{STATUS_LABEL[h.toStatus]}</b>{h.note && <span className="text-muted"> — {h.note}</span>}</span></li>)}</ol></div>
        <div className="card p-5"><h3 className="font-bold mb-3">Transfers</h3>{e.transfers.length ? <ol className="space-y-3 text-sm">{e.transfers.map((t) => <li key={t.id} className="flex gap-3"><span className="text-muted whitespace-nowrap w-24">{fmtDate(t.transferDate)}</span><span>{bname(t.fromBranchId)} → <b>{bname(t.toBranchId)}</b>{t.reason && <span className="text-muted"> — {t.reason}</span>}</span></li>)}</ol> : <p className="text-sm text-muted">No transfers.</p>}</div>
      </div>}

      <Modal open={edit} onClose={() => setEdit(false)} title={`Edit ${e.name}`} wide><EmployeeForm employee={e} onDone={() => setEdit(false)} /></Modal>
      <Modal open={!!statusM} onClose={() => setStatusM(null)} title="Change status">{statusM && <div className="space-y-4">
        <Field label="New status"><select className="field" value={statusM.status} onChange={(ev) => setStatusM({ ...statusM, status: ev.target.value })}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Effective date"><input className="field" type="date" value={statusM.effectiveDate} onChange={(ev) => setStatusM({ ...statusM, effectiveDate: ev.target.value })} /></Field>
        <Field label="Note"><input className="field" value={statusM.note} onChange={(ev) => setStatusM({ ...statusM, note: ev.target.value })} /></Field>
        {["resigned", "terminated"].includes(statusM.status) && <p className="text-xs text-warn">Exit date will be set and the employee's login (if any) will be disabled.</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setStatusM(null)}>Cancel</Button><Button loading={act.isPending} onClick={() => act.mutate({ url: `/employees/${e.id}/status`, body: statusM }, { onSuccess: () => setStatusM(null) })}>Update status</Button></div>
      </div>}</Modal>
      <Modal open={!!transfer} onClose={() => setTransfer(null)} title={`Transfer ${e.firstName}`}>{transfer && <div className="space-y-4">
        <Field label="To branch"><select className="field" value={transfer.toBranchId} onChange={(ev) => setTransfer({ ...transfer, toBranchId: ev.target.value })}><option value="">Select…</option>{branches.data?.data?.filter((b) => b.status === "active").map((b) => <option key={b.id} value={b.id}>{b.name}{b.id === e.branchId ? " (current)" : ""}</option>)}</select></Field>
        <Field label="To department"><select className="field" value={transfer.toDepartmentId} onChange={(ev) => setTransfer({ ...transfer, toDepartmentId: ev.target.value })}><option value="">Keep current</option>{depts.data?.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Transfer date"><input className="field" type="date" value={transfer.transferDate} onChange={(ev) => setTransfer({ ...transfer, transferDate: ev.target.value })} /></Field>
        <Field label="Reason"><input className="field" value={transfer.reason} onChange={(ev) => setTransfer({ ...transfer, reason: ev.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTransfer(null)}>Cancel</Button><Button loading={act.isPending} disabled={!transfer.toBranchId} onClick={() => act.mutate({ url: `/employees/${e.id}/transfer`, body: { ...transfer, toDepartmentId: transfer.toDepartmentId || null } }, { onSuccess: () => setTransfer(null) })}>Transfer</Button></div>
      </div>}</Modal>
      <Modal open={docM} onClose={() => setDocM(false)} title="Upload document"><div className="space-y-4">
        <Field label="Type"><select className="field" value={docMeta.type} onChange={(ev) => setDocMeta({ ...docMeta, type: ev.target.value })}>{Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Title"><input className="field" value={docMeta.title} onChange={(ev) => setDocMeta({ ...docMeta, title: ev.target.value })} placeholder="e.g. Passport copy" /></Field>
        <Field label="Expiry date (optional)"><input className="field" type="date" value={docMeta.expiryDate} onChange={(ev) => setDocMeta({ ...docMeta, expiryDate: ev.target.value })} /></Field>
        <Field label="File (PDF, image, Word · max 10 MB)"><input ref={fileRef} type="file" className="text-sm" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setDocM(false)}>Cancel</Button><Button loading={uploading} onClick={uploadDoc}>Upload</Button></div>
      </div></Modal>
      {!can("employee.view") && nav("/app")}
    </>
  );
}
