import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useGet } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { PageHeader, Loading, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { fmtDate } from "@/lib/utils";
import { EmployeeForm } from "./EmployeeForm";
import { STATUS_LABEL, type EmployeeRow, type Branch, type Dept } from "./types";

export function Avatar({ e, size = 9 }: { e: { name?: string; firstName?: string; photoUrl?: string | null }; size?: number }) {
  const n = e.name ?? e.firstName ?? "?";
  return e.photoUrl ? <img src={e.photoUrl} alt="" className={`h-${size} w-${size} rounded-full object-cover`} /> : <div className={`h-${size} w-${size} rounded-full bg-brand-soft text-brand grid place-items-center text-sm font-bold shrink-0`}>{n[0]?.toUpperCase()}</div>;
}

export default function Employees() {
  const can = useAuth((s) => s.can); const nav = useNavigate();
  const [q, setQ] = useState(""); const [branchId, setBranchId] = useState(""); const [departmentId, setDepartmentId] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const url = `/employees?q=${encodeURIComponent(q)}&branchId=${branchId}&departmentId=${departmentId}&status=${status}&page=${page}&limit=25`;
  const { data, isLoading } = useGet<EmployeeRow[]>(["employees", q, branchId, departmentId, status, page], url);
  const branches = useGet<Branch[]>(["branches"], "/branches"); const depts = useGet<Dept[]>(["departments"], "/departments");
  const total = data?.meta?.total ?? 0;
  return (
    <>
      <PageHeader title="Employees" sub={`${total} in your scope`} actions={can("employee.create") && <Button onClick={() => setOpen(true)}><Plus size={16} /> Add employee</Button>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <input className="field max-w-xs" placeholder="Search name, code, email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="field w-44" value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">All branches</option>{branches.data?.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className="field w-44" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">All departments</option>{depts.data?.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select className="field w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text={q ? "No employees match." : "No employees yet. Add your first employee."} /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[820px]">
          <thead><tr><th className="th">Employee</th><th className="th">Designation</th><th className="th">Department</th><th className="th">Branch</th><th className="th">Manager</th><th className="th">Joined</th><th className="th">Status</th></tr></thead>
          <tbody>{data.data.map((e) => <tr key={e.id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => nav(`/app/employees/${e.id}`)}>
            <td className="td"><div className="flex items-center gap-3"><Avatar e={e} /><div><Link to={`/app/employees/${e.id}`} className="font-semibold hover:text-brand">{e.name}</Link><div className="text-xs text-muted">{e.employeeCode}{e.email ? ` · ${e.email}` : ""}</div></div></div></td>
            <td className="td">{e.designationName ?? "—"}</td><td className="td">{e.departmentName ?? "—"}</td><td className="td">{e.branchName ?? "—"}</td><td className="td text-muted">{e.managerName || "—"}</td><td className="td text-muted">{fmtDate(e.joiningDate)}</td>
            <td className="td"><Badge status={e.status}>{STATUS_LABEL[e.status]}</Badge></td>
          </tr>)}</tbody>
        </table></div>
      )}
      {total > 25 && <div className="flex items-center justify-between mt-3 text-sm text-muted"><span>Page {page} of {Math.ceil(total / 25)}</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= Math.ceil(total / 25)} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
      <Modal open={open} onClose={() => setOpen(false)} title="Add employee" wide><EmployeeForm onDone={(id) => { setOpen(false); if (id) nav(`/app/employees/${id}`); }} /></Modal>
    </>
  );
}
