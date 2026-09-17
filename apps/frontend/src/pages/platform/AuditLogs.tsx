import { useGet } from "@/lib/queries";
import { PageHeader, Loading, Empty } from "@/components/ui/page";

type Log = { id: string; userName: string | null; action: string; entity: string; entityId: string | null; details: Record<string, unknown> | null; ip: string | null; createdAt: string; companyId: string | null };
export default function AuditLogs() {
  const { data, isLoading } = useGet<Log[]>(["audit"], "/audit-logs?limit=100");
  return (
    <>
      <PageHeader title="Audit logs" sub="Every critical action across the platform." />
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No activity recorded yet." /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[720px]">
          <thead><tr><th className="th">When</th><th className="th">User</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Details</th><th className="th">IP</th></tr></thead>
          <tbody>{data.data.map((l) => <tr key={l.id}>
            <td className="td whitespace-nowrap text-muted">{new Date(l.createdAt).toLocaleString("en-IN")}</td>
            <td className="td">{l.userName ?? "system"}</td>
            <td className="td"><span className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px] font-semibold">{l.action}</span></td>
            <td className="td">{l.entity}<div className="text-[11px] text-muted font-mono">{l.entityId?.slice(0, 8)}</div></td>
            <td className="td text-xs text-muted max-w-xs truncate">{l.details ? JSON.stringify(l.details) : "—"}</td>
            <td className="td text-xs text-muted">{l.ip ?? "—"}</td>
          </tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
