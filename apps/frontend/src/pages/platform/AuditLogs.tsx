import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useGet } from "@/lib/queries";
import { PageHeader, Loading, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

type Log = { id: string; companyId: string | null; companyName: string | null; userName: string | null; action: string; entity: string; entityId: string | null; details: Record<string, unknown> | null; ip: string | null; createdAt: string };
type CompanyOpt = { id: string; name: string };
const LIMIT = 50;

export default function AuditLogs() {
  const [params, setParams] = useSearchParams();
  const companyId = params.get("companyId") ?? "";
  const [page, setPage] = useState(1);
  const companies = useGet<CompanyOpt[]>(["companies-lite"], "/companies?limit=200");
  const { data, isLoading } = useGet<Log[]>(["audit", companyId, page], `/audit-logs?limit=${LIMIT}&page=${page}${companyId ? `&companyId=${companyId}` : ""}`);
  const total = data?.meta?.total ?? 0;

  const onCompanyChange = (v: string) => {
    setPage(1);
    setParams(v ? { companyId: v } : {});
  };

  return (
    <>
      <PageHeader title="Audit logs" sub="Every critical action across the platform — filter by company to see just its history." />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select className="field max-w-xs" value={companyId} onChange={(e) => onCompanyChange(e.target.value)}>
          <option value="">All companies</option>
          <option value="platform">Platform actions only</option>
          {companies.data?.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {companyId && <Button variant="secondary" size="sm" onClick={() => onCompanyChange("")}>Clear filter</Button>}
      </div>
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No activity recorded yet." /> : (
        <>
          <div className="card overflow-x-auto"><table className="w-full min-w-[820px]">
            <thead><tr><th className="th">When</th><th className="th">Company</th><th className="th">User</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Details</th><th className="th">IP</th></tr></thead>
            <tbody>{data.data.map((l) => <tr key={l.id}>
              <td className="td whitespace-nowrap text-muted">{new Date(l.createdAt).toLocaleString("en-IN")}</td>
              <td className="td">{l.companyName ?? (l.companyId ? "—" : <span className="text-muted italic">Platform</span>)}</td>
              <td className="td">{l.userName ?? "system"}</td>
              <td className="td"><span className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] font-semibold">{l.action}</span></td>
              <td className="td">{l.entity}<div className="text-[11px] text-muted font-mono">{l.entityId?.slice(0, 8)}</div></td>
              <td className="td text-xs text-muted max-w-xs truncate">{l.details ? JSON.stringify(l.details) : "—"}</td>
              <td className="td text-xs text-muted">{l.ip ?? "—"}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="flex items-center justify-between mt-3 text-sm text-muted">
            <span>{total.toLocaleString("en-IN")} total{companyId && companyId !== "platform" && companies.data?.data ? ` for ${companies.data.data.find((c) => c.id === companyId)?.name ?? ""}` : ""}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={page * LIMIT >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
