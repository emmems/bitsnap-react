import { trpcAstro } from "@/queries/trpcAstro";
import { useEffect, useState } from "react";

interface Invoice {
  id: number;
  invoiceNumber: string;
  status: string;
  issueDate: number;
  dueDate: number;
  totalAmount: number;
  currency: string;
  pdfUrl: string | null;
  billingMonth: number | null;
  billingYear: number | null;
}

interface PanelOrderHistoryComponentProps {
  projectID: string;
}

const formatDate = (ts: number): string =>
  new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const formatAmount = (amount: number, currency: string): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

const statusLabel: Record<string, string> = {
  draft: "Szkic",
  unpaid: "Nieopłacona",
  paid: "Opłacona",
  overdue: "Zaległa",
  cancelled: "Anulowana",
};

const statusColor: Record<string, string> = {
  draft: "text-neutral-400",
  unpaid: "text-yellow-500",
  paid: "text-green-600",
  overdue: "text-red-500",
  cancelled: "text-neutral-400 line-through",
};

function PanelOrderHistoryComponent({ projectID }: PanelOrderHistoryComponentProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    trpcAstro.userPanel.getCustomerInvoices
      .query({ projectID })
      .then((res) => {
        if (res.success) setInvoices(res.invoices);
      })
      .finally(() => setIsLoading(false));
  }, [projectID]);

  return (
    <>
      <h3 className="text-2xl">Historia zamówień</h3>
      <p className="text-sm text-neutral-500">Twoje faktury i rozliczenia</p>

      {isLoading ? (
        <div className="mt-6 text-sm text-neutral-400">Ładowanie...</div>
      ) : invoices.length === 0 ? (
        <div className="mt-6 text-sm text-neutral-400">Brak faktur.</div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{inv.invoiceNumber}</p>
                  <p className="text-xs text-neutral-500">
                    {inv.billingMonth != null && inv.billingYear != null
                      ? `${inv.billingMonth}/${inv.billingYear}`
                      : formatDate(inv.issueDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {formatAmount(inv.totalAmount, inv.currency)}
                  </p>
                  <p
                    className={`text-xs font-medium ${statusColor[inv.status] ?? "text-neutral-400"}`}
                  >
                    {statusLabel[inv.status] ?? inv.status}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                <span>Termin: {formatDate(inv.dueDate)}</span>
                {inv.pdfUrl && (
                  <a
                    href={inv.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-600 underline dark:text-blue-400"
                  >
                    Pobierz PDF
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default PanelOrderHistoryComponent;
