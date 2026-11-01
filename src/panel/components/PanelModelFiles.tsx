import { createClient } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useCallback, useMemo, useState } from "react";

import { getLocale } from "../../components/checkout/locale";
import {
  ModelDeliveryFailure,
  ModelDeliveryService,
  ModelFileState,
  type PurchasedModel,
} from "../../gen/proto/public/v1/model_delivery_pb";

/**
 * "3D files" of the customer panel: the 3D files of the buyer's paid orders in
 * this shop (`public.v1.ModelDeliveryService`), with a download button, the
 * licence and the "seller removed the file" state. The download URL is signed
 * on click and expires quickly, so it is never rendered into the page.
 *
 * Older Bitsnap servers have no such service: any transport error (404,
 * unimplemented, network) hides the section, so the panel looks as before.
 *
 * Loaded on demand (with `model-files-client.ts`) only when the buyer has 3D
 * files, so the main bundle carries just `model-files-load.ts`.
 */

type Copy = {
  title: string;
  subtitle: string;
  download: string;
  preparing: string;
  licence: string;
  purchased: string;
  accessUntil: string;
  removed: string;
  contact: string;
  expired: string;
  failure: Partial<Record<ModelDeliveryFailure, string>>;
  error: string;
};

const COPY: { pl: Copy; en: Copy } = {
  pl: {
    title: "Pliki 3D",
    subtitle: "Pobierasz zawsze aktualną wersję pliku.",
    download: "Pobierz",
    preparing: "Przygotowuję…",
    licence: "Licencja",
    purchased: "Kupiono",
    accessUntil: "Dostęp do",
    removed: "Sprzedawca usunął ten plik.",
    contact: "Napisz do sprzedawcy",
    expired: "Dostęp do pliku wygasł",
    failure: {
      [ModelDeliveryFailure.UNAUTHORIZED]: "Sesja wygasła. Zaloguj się ponownie.",
      [ModelDeliveryFailure.NOT_FOUND]: "Nie znaleźliśmy tego pliku.",
      [ModelDeliveryFailure.REFUNDED]: "Zamówienie zostało zwrócone lub anulowane.",
      [ModelDeliveryFailure.EXPIRED]: "Dostęp do pliku wygasł.",
      [ModelDeliveryFailure.REMOVED]: "Sprzedawca usunął ten plik.",
      [ModelDeliveryFailure.UNPAID]: "Zamówienie nie jest opłacone.",
    },
    error: "Nie udało się pobrać pliku. Spróbuj ponownie.",
  },
  en: {
    title: "3D files",
    subtitle: "You always download the current version of the file.",
    download: "Download",
    preparing: "Preparing…",
    licence: "Licence",
    purchased: "Purchased",
    accessUntil: "Access until",
    removed: "The seller removed this file.",
    contact: "Contact the seller",
    expired: "Access to the file has ended",
    failure: {
      [ModelDeliveryFailure.UNAUTHORIZED]: "Your session has expired. Sign in again.",
      [ModelDeliveryFailure.NOT_FOUND]: "We could not find this file.",
      [ModelDeliveryFailure.REFUNDED]: "The order was refunded or canceled.",
      [ModelDeliveryFailure.EXPIRED]: "Access to the file has ended.",
      [ModelDeliveryFailure.REMOVED]: "The seller removed this file.",
      [ModelDeliveryFailure.UNPAID]: "The order is not paid.",
    },
    error: "The file could not be downloaded. Try again.",
  },
};

function formatSize(bytes: bigint, en: boolean): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  const mb = value / (1024 * 1024);
  const fmt = new Intl.NumberFormat(en ? "en-GB" : "pl-PL", {
    maximumFractionDigits: 1,
  });
  return mb >= 1 ? `${fmt.format(mb)} MB` : `${fmt.format(value / 1024)} KB`;
}

function formatDate(seconds: bigint | undefined, en: boolean): string {
  if (seconds == null || seconds <= 0n) return "";
  return new Intl.DateTimeFormat(en ? "en-GB" : "pl-PL", {
    dateStyle: "medium",
  }).format(new Date(Number(seconds) * 1000));
}

function CubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
      aria-hidden
    >
      <path d="M12 2.5 3.5 7v10L12 21.5 20.5 17V7L12 2.5Z" strokeLinejoin="round" />
      <path d="M3.5 7 12 11.5 20.5 7M12 11.5v10" strokeLinejoin="round" />
    </svg>
  );
}

export default function PanelModelFiles({
  accessToken,
  models,
  buttonStyle,
}: {
  accessToken: string;
  models: PurchasedModel[];
  buttonStyle?: React.CSSProperties;
}) {
  const en = getLocale().toLowerCase().startsWith("en");
  const t = en ? COPY.en : COPY.pl;
  const transport = useTransport();
  const client = useMemo(
    () => createClient(ModelDeliveryService, transport),
    [transport],
  );
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const download = useCallback(
    async (model: PurchasedModel, index: number) => {
      const key = `${model.orderId}:${model.lineId}:${index}`;
      setPending(key);
      setErrors((current) => ({ ...current, [key]: "" }));
      try {
        const response = await client.getModelFileDownloadUrl({
          accessToken,
          orderId: model.orderId,
          lineId: model.lineId,
          fileIndex: index,
        });
        if (response.result.case === "success") {
          // An attachment: the browser downloads it and stays on the panel.
          window.location.assign(response.result.value.url);
        } else {
          const failure =
            response.result.case === "failure" ? response.result.value : undefined;
          setErrors((current) => ({
            ...current,
            [key]: (failure != null ? t.failure[failure] : undefined) ?? t.error,
          }));
        }
      } catch {
        setErrors((current) => ({ ...current, [key]: t.error }));
      } finally {
        setPending(null);
      }
    },
    [client, accessToken, t],
  );

  if (models.length === 0) return null;

  return (
    <section
      aria-labelledby="bitsnap-panel-model-files"
      className="mt-10 w-full max-w-5xl"
      data-testid="model-files"
    >
      <div className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <header className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <h2
            id="bitsnap-panel-model-files"
            className="text-lg font-semibold text-neutral-900 dark:text-neutral-50"
          >
            {t.title}
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {t.subtitle}
          </p>
        </header>
        <ul className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {models.map((model) => {
            const title = model.variantName
              ? `${model.productName} – ${model.variantName}`
              : model.productName;
            return (
              <li
                key={`${model.orderId}:${model.lineId}`}
                className="flex min-w-0 flex-col gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-700"
                data-state={ModelFileState[model.state]}
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
                    {model.thumbnailUrl ? (
                      <img
                        src={model.thumbnailUrl}
                        alt={title}
                        className="size-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <CubeIcon className="size-7" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="break-words font-medium text-neutral-900 dark:text-neutral-50">
                      {title}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                      {[
                        model.files[0]
                          ? `${model.files[0].format.toUpperCase()} · ${formatSize(model.files[0].fileSize, en)}`
                          : "",
                        `${t.purchased} ${formatDate(model.purchasedAt, en)}`,
                        model.accessExpiresAt != null &&
                        model.state === ModelFileState.AVAILABLE
                          ? `${t.accessUntil} ${formatDate(model.accessExpiresAt, en)}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {model.licence && (
                      <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">
                        {t.licence}:{" "}
                        {model.licence.url ? (
                          <a
                            href={model.licence.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-50"
                          >
                            {model.licence.name}
                          </a>
                        ) : (
                          model.licence.name
                        )}
                      </p>
                    )}
                    {model.state === ModelFileState.REMOVED && (
                      <p
                        className="mt-1 text-sm text-neutral-700 dark:text-neutral-200"
                        data-model-removed=""
                      >
                        {t.removed}
                        {model.seller?.email && (
                          <>
                            {" "}
                            {t.contact}
                            {model.seller.name ? ` (${model.seller.name})` : ""}:{" "}
                            <a
                              className="font-medium underline underline-offset-2"
                              href={`mailto:${model.seller.email}`}
                            >
                              {model.seller.email}
                            </a>
                          </>
                        )}
                      </p>
                    )}
                    {model.state === ModelFileState.EXPIRED && (
                      <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">
                        {t.expired}
                        {model.accessExpiresAt != null
                          ? ` ${formatDate(model.accessExpiresAt, en)}`
                          : ""}
                        .
                      </p>
                    )}
                  </div>
                </div>
                {model.state === ModelFileState.AVAILABLE &&
                  model.files.map((file) => {
                    const key = `${model.orderId}:${model.lineId}:${file.index}`;
                    const busy = pending === key;
                    return (
                      <div
                        key={key}
                        className="flex flex-col items-start gap-1 sm:items-end"
                      >
                        <button
                          type="button"
                          onClick={() => void download(model, file.index)}
                          disabled={pending != null}
                          aria-busy={busy || undefined}
                          aria-label={`${t.download}: ${file.fileName}`}
                          data-model-download=""
                          style={buttonStyle}
                          className="min-h-11 inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-neutral-50 dark:text-neutral-900"
                        >
                          {busy ? t.preparing : t.download}
                        </button>
                        {errors[key] && (
                          <p
                            className="text-sm text-red-700 dark:text-red-400"
                            role="alert"
                          >
                            {errors[key]}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
