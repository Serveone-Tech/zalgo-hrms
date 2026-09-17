import { useGet, useAction } from "@/lib/queries";
import { PageHeader, Loading } from "@/components/ui/page";
import { InvoiceTable, type Invoice } from "@/components/InvoiceTable";

export default function Invoices() {
  const { data, isLoading } = useGet<Invoice[]>(["invoices"], "/invoices/platform");
  const act = useAction([["invoices"], ["platform-dashboard"], ["companies"]]);
  return (
    <>
      <PageHeader title="Invoices" sub="Generated automatically on plan assignment, renewal, branch approval and add-ons. Mark paid when payment arrives." />
      {isLoading ? <Loading /> : <InvoiceTable rows={data?.data ?? []} pending={act.isPending} onStatus={(id, status) => act.mutate({ url: `/invoices/platform/${id}/status`, body: { status } })} />}
    </>
  );
}
