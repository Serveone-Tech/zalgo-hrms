import { useGet } from "@/lib/queries";
import { PageHeader, Loading, Empty, Stat } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { fmtDate, inr } from "@/lib/utils";

type Row = {
  id: string; companyId: string; companyName: string | null; purpose: string; amount: string; currency: string;
  status: string; razorpayOrderId: string | null; razorpayPaymentId: string | null; createdAt: string; paidAt: string | null;
};
type Stats = { mrrThisMonth: number; byStatus: { status: string; n: number }[] };

export default function Payments() {
  const { data, isLoading } = useGet<Row[]>(["platform-payments"], "/payments/platform");
  const stats = useGet<Stats>(["platform-payments-stats"], "/payments/platform/stats");
  const s = stats.data?.data;
  const countOf = (status: string) => s?.byStatus.find((x) => x.status === status)?.n ?? 0;

  return (
    <>
      <PageHeader title="Payments" sub="All Razorpay payments across companies." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <Stat label="Revenue this month" value={inr(s?.mrrThisMonth ?? 0)} />
        <Stat label="Paid" value={countOf("paid")} tone="good" />
        <Stat label="Created (pending)" value={countOf("created")} tone="warn" />
        <Stat label="Failed" value={countOf("failed")} tone="danger" />
      </div>
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No payments yet." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead><tr><th className="th">Company</th><th className="th">Purpose</th><th className="th">Amount</th><th className="th">Razorpay order</th><th className="th">Razorpay payment</th><th className="th">Status</th><th className="th">Date</th></tr></thead>
            <tbody>{data.data.map((p) => (
              <tr key={p.id} className="hover:bg-surface-2/60">
                <td className="td font-semibold">{p.companyName ?? "—"}</td>
                <td className="td capitalize">{p.purpose.replace("_", " ")}</td>
                <td className="td tabular-nums">{inr(p.amount)}</td>
                <td className="td text-xs text-muted">{p.razorpayOrderId ?? "—"}</td>
                <td className="td text-xs text-muted">{p.razorpayPaymentId ?? "—"}</td>
                <td className="td"><Badge status={p.status} /></td>
                <td className="td">{fmtDate(p.paidAt ?? p.createdAt)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
