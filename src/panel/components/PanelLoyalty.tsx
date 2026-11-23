import { Award, Coins, QrCode, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Environment } from "../../gen/proto/common/v1/environment_pb";
import { rpcProvider, useMutation, useQuery } from "../../rpc-provider";
import { getPanelTexts } from "../texts";

interface PanelLoyaltyComponentProps {
  projectID: string;
  accessToken: string;
}

function formatMoneyMinor(minor: bigint, currency: string): string {
  const value = Number(minor) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "PLN",
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || "PLN"}`;
  }
}

function formatUnixDate(sec: bigint): string {
  const ms = Number(sec) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Date(ms).toLocaleDateString();
}

export default function PanelLoyaltyComponent({
  projectID,
  accessToken,
}: PanelLoyaltyComponentProps) {
  const texts = getPanelTexts();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [exchangeFailed, setExchangeFailed] = useState(false);

  const { mutateAsync: exchangeSession } = useMutation(
    rpcProvider.loyalty.exchangePanelSession,
  );

  useEffect(() => {
    let cancelled = false;
    if (!projectID || !accessToken) return;
    setExchangeFailed(false);
    exchangeSession({
      projectId: projectID,
      accessToken,
      environment: Environment.PRODUCTION,
    })
      .then((res) => {
        if (!cancelled && res.sessionToken) {
          setSessionToken(res.sessionToken);
        }
      })
      .catch(() => {
        if (!cancelled) setExchangeFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectID, accessToken, exchangeSession]);

  const {
    data: hub,
    isLoading: hubLoading,
    isError: hubError,
    refetch: refetchHub,
  } = useQuery(
    rpcProvider.loyalty.getLoyaltyHub,
    {
      projectId: projectID,
      environment: Environment.PRODUCTION,
      sessionToken: sessionToken ?? undefined,
    },
    { enabled: Boolean(projectID && sessionToken) },
  );

  const { data: ledger } = useQuery(
    rpcProvider.loyalty.listLoyaltyLedger,
    {
      projectId: projectID,
      environment: Environment.PRODUCTION,
      sessionToken: sessionToken ?? undefined,
      pageSize: 20,
      pageToken: "",
    },
    { enabled: Boolean(projectID && sessionToken && hub?.branding?.pointsEnabled) },
  );

  const {
    data: qr,
    refetch: refetchQr,
    isFetching: qrFetching,
  } = useQuery(
    rpcProvider.loyalty.getLoyaltyQrCard,
    {
      projectId: projectID,
      environment: Environment.PRODUCTION,
      sessionToken: sessionToken ?? undefined,
    },
    {
      enabled: Boolean(
        projectID &&
          sessionToken &&
          (hub?.branding?.pointsEnabled || hub?.branding?.clubsEnabled),
      ),
      refetchInterval: 150_000,
    },
  );

  if (exchangeFailed || hubError) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-semibold">{texts.loyaltyHeading}</h1>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          <p>{texts.loyaltyError}</p>
          <button
            type="button"
            onClick={() => refetchHub()}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-800"
          >
            {texts.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!sessionToken || hubLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-semibold">{texts.loyaltyHeading}</h1>
        <div className="h-32 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
      </div>
    );
  }

  const branding = hub?.branding;
  if (!branding || (!branding.pointsEnabled && !branding.clubsEnabled)) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-semibold">{texts.loyaltyHeading}</h1>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          {texts.loyaltyUnavailable}
        </div>
      </div>
    );
  }

  const shortLabel = branding.pointsShortLabel || "pkt";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        {branding.pointsIconType === "upload" && branding.pointsIconValue ? (
          <img
            src={branding.pointsIconValue}
            alt={branding.pointsName}
            className="h-8 w-8 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-900 text-white dark:bg-white dark:text-black">
            <Coins className="h-4 w-4" aria-hidden="true" />
          </div>
        )}
        <h1 className="text-xl font-semibold">
          {branding.pointsName || texts.loyaltyHeading}
        </h1>
      </div>

      {branding.pointsEnabled && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {texts.loyaltyAvailablePoints}
            </p>
            <p className="mt-1 text-3xl font-semibold">
              {String(hub.availablePoints)} {shortLabel}
            </p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {formatMoneyMinor(hub.availableValueMinor, branding.currency)}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {texts.loyaltyPendingPoints}
            </p>
            <p className="mt-1 text-3xl font-semibold">
              {String(hub.pendingPoints)} {shortLabel}
            </p>
          </div>
        </div>
      )}

      {branding.clubsEnabled && hub.clubs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{texts.loyaltyClubsHeading}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {hub.clubs.map((club) => (
              <div
                key={club.id}
                className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
              >
                {club.iconType === "upload" && club.iconValue ? (
                  <img
                    src={club.iconValue}
                    alt={club.name}
                    className="h-9 w-9 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
                    <Award className="h-5 w-5" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{club.name}</p>
                  {club.description && (
                    <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                      {club.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {qr?.qrDataUrl && (
        <section className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-5 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <QrCode className="h-4 w-4" aria-hidden="true" />
            <span>{texts.loyaltyQrHeading}</span>
          </div>
          <img
            src={qr.qrDataUrl}
            alt={texts.loyaltyQrHeading}
            className="h-44 w-44 rounded-lg bg-white p-2"
          />
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {texts.loyaltyQrHint}
          </p>
          <button
            type="button"
            onClick={() => refetchQr()}
            disabled={qrFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {texts.retry}
          </button>
        </section>
      )}

      {branding.pointsEnabled && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{texts.loyaltyHistoryHeading}</h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            {!ledger || ledger.items.length === 0 ? (
              <p className="p-5 text-sm text-neutral-600 dark:text-neutral-400">
                {texts.loyaltyHistoryEmpty}
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {ledger.items.map((item) => {
                  const positive = item.pointsDelta > 0n;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {item.reason || item.type}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {formatUnixDate(item.createdAt)}
                        </p>
                      </div>
                      <span
                        className={
                          positive
                            ? "shrink-0 font-semibold text-emerald-700 dark:text-emerald-400"
                            : "shrink-0 font-semibold text-neutral-900 dark:text-white"
                        }
                      >
                        {positive ? "+" : ""}
                        {String(item.pointsDelta)} {shortLabel}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
