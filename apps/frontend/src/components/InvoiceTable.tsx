import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate, inr } from "@/lib/utils";
import { Empty } from "@/components/ui/page";

export type Invoice = { id: string; invoiceNumber: string; planName: string | null; basePrice: string; additionalBranchPrice: string; additionalEmployeePrice: string; additionalDevicePrice: string; addonsPrice: string; taxPercent: string; taxAmount: string; totalAmount: string; periodStart: string; periodEnd: string; reason: string; status: string; paidAt: string | null; notes: string | null; createdAt: string };

export function InvoiceTable({ rows, onStatus, onPay, pending }: { rows: Invoice[]; onStatus?: (id: string, status: "paid" | "cancelled" | "pending") => void; onPay?: (i: Invoice) => void; pending?: boolean }) {
  if (!rows.length) return <Empty text="No invoices yet." />;
  return (
    <div className="card overflow-x-auto"><table className="w-full min-w-[720px]">
      <thead><tr><th className="th">Invoice</th><th className="th">Reason</th><th className="th">Period</th><th className="th">Subtotal</th><th className="th">GST</th><th className="th">Total</th><th className="th">Status</th>{(onStatus || onPay) && <th className="th"></th>}</tr></thead>
      <tbody>{rows.map((i) => {
        const sub = Number(i.totalAmount) - Number(i.taxAmount);
        return <tr key={i.id}>
          <td className="td font-mono text-[13px] font-semibold">{i.invoiceNumber}<div className="text-[11px] text-muted font-sans font-normal">{fmtDate(i.createdAt)}{i.planName ? ` · ${i.planName}` : ""}</div></td>
          <td className="td capitalize">{i.reason.replace(/_/g, " ")}{i.notes && <div className="text-xs text-muted">{i.notes}</div>}</td>
          <td className="td text-muted whitespace-nowrap">{fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)}</td>
          <td className="td tabular-nums">{inr(sub)}</td>
          <td className="td tabular-nums text-muted">{inr(i.taxAmount)} <span className="text-[11px]">({Number(i.taxPercent)}%)</span></td>
          <td className="td tabular-nums font-bold">{inr(i.totalAmount)}</td>
          <td className="td"><Badge status={i.status} />{i.paidAt && <div className="text-[11px] text-muted">{fmtDate(i.paidAt)}</div>}</td>
          {onStatus && <td className="td text-right whitespace-nowrap">
            {i.status !== "paid" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => onStatus(i.id, "paid")}>Mark paid</Button>}
            {i.status === "pending" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => onStatus(i.id, "cancelled")}>Cancel</Button>}
          </td>}
          {!onStatus && onPay && <td className="td text-right whitespace-nowrap">
            {i.status === "pending" && <Button size="sm" disabled={pending} onClick={() => onPay(i)}>Pay now</Button>}
          </td>}
        </tr>;
      })}</tbody>
    </table></div>
  );
}
