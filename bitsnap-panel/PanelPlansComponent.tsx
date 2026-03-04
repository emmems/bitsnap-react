import { trpcAstro } from "@/queries/trpcAstro";
import { useEffect, useState } from "react";

interface Plan {
  id: number;
  tierKey: string;
  tierName: string;
  configName: string;
  status: string;
  billingDay: number;
  startDate: number;
  endDate: number | null;
}

interface PanelPlansComponentProps {
  projectID: string;
}

const formatDate = (ts: number): string =>
  new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const statusLabel: Record<string, string> = {
  active: "Aktywny",
  cancelled: "Anulowany",
  paused: "Wstrzymany",
};

const statusColor: Record<string, string> = {
  active: "text-green-600",
  cancelled: "text-red-500",
  paused: "text-yellow-500",
};

function PanelPlansComponent({ projectID }: PanelPlansComponentProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    trpcAstro.userPanel.getCustomerPlans
      .query({ projectID })
      .then((res) => {
        if (res.success) setPlans(res.plans);
      })
      .finally(() => setIsLoading(false));
  }, [projectID]);

  return (
    <>
      <h3 className="text-2xl">Plany</h3>
      <p className="text-sm text-neutral-500">Twoje aktywne subskrypcje</p>

      {isLoading ? (
        <div className="mt-6 text-sm text-neutral-400">Ładowanie...</div>
      ) : plans.length === 0 ? (
        <div className="mt-6 text-sm text-neutral-400">
          Brak aktywnych planów.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-xl bg-white p-5 shadow-sm dark:bg-neutral-800"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{plan.tierName}</p>
                  {plan.configName && (
                    <p className="text-sm text-neutral-500">{plan.configName}</p>
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${statusColor[plan.status] ?? "text-neutral-500"}`}
                >
                  {statusLabel[plan.status] ?? plan.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                <div>
                  <span className="font-medium">Dzień rozliczenia:</span>{" "}
                  {plan.billingDay}
                </div>
                <div>
                  <span className="font-medium">Data startu:</span>{" "}
                  {formatDate(plan.startDate)}
                </div>
                {plan.endDate && (
                  <div>
                    <span className="font-medium">Data zakończenia:</span>{" "}
                    {formatDate(plan.endDate)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default PanelPlansComponent;
