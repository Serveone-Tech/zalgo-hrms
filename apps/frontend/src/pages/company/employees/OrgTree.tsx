import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useGet } from "@/lib/queries";
import { PageHeader, Loading, Empty } from "@/components/ui/page";
import { Avatar } from "./Employees";
import type { EmployeeRow } from "./types";

type Node = EmployeeRow & { children: Node[] };
function Branch({ n, depth }: { n: Node; depth: number }) {
  return (
    <li className="relative">
      <div className="flex items-center gap-3 py-1.5" style={{ paddingLeft: depth * 24 }}>
        {depth > 0 && <span className="h-px w-4 bg-line -ml-5" />}
        <Avatar e={n} size={8} />
        <div className="min-w-0"><Link to={`/app/employees/${n.id}`} className="text-sm font-semibold hover:text-brand">{n.name}</Link><div className="text-xs text-muted truncate">{n.designationName ?? "—"} · {n.departmentName ?? "—"} · {n.branchName}</div></div>
        {n.children.length > 0 && <span className="ml-auto text-[11px] rounded bg-surface-2 px-1.5 py-0.5 text-muted">{n.children.length}</span>}
      </div>
      {n.children.length > 0 && <ul className="border-l border-line ml-4">{n.children.map((c) => <Branch key={c.id} n={c} depth={depth + 1} />)}</ul>}
    </li>
  );
}
export default function OrgTree() {
  const { data, isLoading } = useGet<EmployeeRow[]>(["org-tree"], "/employees/org-tree");
  const roots = useMemo(() => {
    const rows = data?.data ?? []; const map = new Map<string, Node>(rows.map((r) => [r.id, { ...r, children: [] }]));
    const out: Node[] = [];
    for (const n of map.values()) { const p = n.reportingManagerId ? map.get(n.reportingManagerId) : undefined; if (p) p.children.push(n); else out.push(n); }
    return out;
  }, [data]);
  if (isLoading) return <Loading />;
  return (
    <>
      <PageHeader title="Organization" sub="Reporting structure. Employees without a manager appear at the top." />
      {!roots.length ? <Empty text="Add employees and set reporting managers to build the tree." /> : <div className="card p-4"><ul>{roots.map((r) => <Branch key={r.id} n={r} depth={0} />)}</ul></div>}
    </>
  );
}
