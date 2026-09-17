import { useGet } from "@/lib/queries";
import { api } from "@/lib/api";
import { PageHeader, Loading, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { inr, fmtDate } from "@/lib/utils";
import { monthLabel } from "./types";

export default function MyPayslips() {
  const { data, isLoading } = useGet<{ id: string; month: string; gross: string; totalDeductions: string; net: string; payableDays: string; lopDays: string; paidAt: string | null }[]>(["my-payslips"], "/payroll/payslips/me");
  const open = async (id: string) => { const res = await api.get(`/payroll/payslips/${id}`, { responseType: "blob" }); window.open(URL.createObjectURL(res.data), "_blank"); };
  return (
    <>
      <PageHeader title="My payslips" sub="Released after payroll is marked paid." />
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No payslips yet." /> : <div className="card overflow-x-auto"><table className="w-full min-w-[560px]"><thead><tr><th className="th">Month</th><th className="th">Payable days</th><th className="th">Gross</th><th className="th">Deductions</th><th className="th">Net pay</th><th className="th">Paid on</th><th className="th"></th></tr></thead>
        <tbody>{data.data.map((p) => <tr key={p.id}><td className="td font-semibold">{monthLabel(p.month)}</td><td className="td tabular-nums">{Number(p.payableDays)}{Number(p.lopDays) ? <span className="text-danger text-xs"> (−{Number(p.lopDays)} LOP)</span> : ""}</td><td className="td tabular-nums">{inr(p.gross)}</td><td className="td tabular-nums">{inr(p.totalDeductions)}</td><td className="td tabular-nums font-bold">{inr(p.net)}</td><td className="td text-muted">{fmtDate(p.paidAt)}</td><td className="td text-right"><Button size="sm" variant="secondary" onClick={() => open(p.id)}>Download PDF</Button></td></tr>)}</tbody></table></div>}
    </>
  );
}
