import { useState } from "react";
import { Download } from "lucide-react";
import { useGet } from "@/lib/queries";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/ui/toast";
import { PageHeader, Loading, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Branch, Dept } from "../employees/types";

type R = { key: string; name: string; description: string; params: string[] };
export default function Reports() {
  const can = useAuth((s) => s.can); const { toast } = useToast();
  const list = useGet<R[]>(["reports"], "/reports"); const branches = useGet<Branch[]>(["branches"], "/branches"); const depts = useGet<Dept[]>(["departments"], "/departments");
  const [key, setKey] = useState("employees"); const today = new Date().toISOString().slice(0, 10);
  const [q, setQ] = useState({ from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), to: today, month: today.slice(0, 7), branchId: "", departmentId: "" });
  const qs = `from=${q.from}&to=${q.to}&month=${q.month}&branchId=${q.branchId}&departmentId=${q.departmentId}`;
  const { data, isLoading, isFetching } = useGet<{ columns: string[]; rows: Record<string, any>[]; total: number }>(["report", key, qs], `/reports/${key}?${qs}`);
  const rep = list.data?.data?.find((r) => r.key === key);
  const dl = async (format: string) => { try { const res = await api.get(`/reports/${key}?${qs}&format=${format}`, { responseType: "blob" }); const u = URL.createObjectURL(res.data); if (format === "pdf") window.open(u, "_blank"); else { const a = document.createElement("a"); a.href = u; a.download = `${key}-${today}.${format}`; a.click(); } URL.revokeObjectURL(u); } catch { toast("Export failed", "error"); } };
  return (
    <>
      <PageHeader title="Reports" sub="Filter, preview and export to Excel, CSV or PDF." actions={can("report.export") && <div className="flex gap-1">{["xlsx", "csv", "pdf"].map((f) => <Button key={f} size="sm" variant="secondary" onClick={() => dl(f)}><Download size={13} /> {f.toUpperCase()}</Button>)}</div>} />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-1">{list.data?.data?.map((r) => <button key={r.key} onClick={() => setKey(r.key)} className={cn("w-full text-left rounded-md px-3 py-2 text-sm", key === r.key ? "bg-brand text-brand-ink font-semibold" : "hover:bg-surface-2")}>{r.name}</button>)}</div>
        <div><p className="text-sm text-muted mb-3">{rep?.description}</p>
          <div className="flex flex-wrap gap-2 mb-4">{rep?.params.includes("from") && <><input className="field w-40" type="date" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} /><input className="field w-40" type="date" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} /></>}{rep?.params.includes("month") && <input className="field w-40" type="month" value={q.month} onChange={(e) => setQ({ ...q, month: e.target.value })} />}<select className="field w-44" value={q.branchId} onChange={(e) => setQ({ ...q, branchId: e.target.value })}><option value="">All branches</option>{branches.data?.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><select className="field w-44" value={q.departmentId} onChange={(e) => setQ({ ...q, departmentId: e.target.value })}><option value="">All departments</option>{depts.data?.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          {isLoading || !data?.data ? <Loading /> : !data.data.rows.length ? <Empty text="No data for these filters." /> : (() => { const d = data.data!; return <><div className="text-xs text-muted mb-2">{d.total} rows{isFetching ? " · refreshing…" : ""}{d.total > 200 ? " · showing first 200 — export for all" : ""}</div><div className="card overflow-x-auto max-h-[65vh]"><table className="w-full text-[13px]"><thead className="sticky top-0 bg-surface"><tr>{d.columns.map((c) => <th key={c} className="th whitespace-nowrap">{c}</th>)}</tr></thead><tbody>{d.rows.slice(0, 200).map((r, i) => <tr key={i}>{d.columns.map((c) => <td key={c} className="td whitespace-nowrap tabular-nums">{typeof r[c] === "boolean" ? (r[c] ? "Yes" : "No") : String(r[c] ?? "")}</td>)}</tr>)}</tbody></table></div></>; })()}
        </div>
      </div>
    </>
  );
}
