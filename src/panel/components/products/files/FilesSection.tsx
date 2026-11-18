import { Download, ExternalLink, File as FileIcon } from "lucide-react";
import { useId } from "react";
import { rpcProvider, useMutation } from "../../../../rpc-provider";
import { cn } from "../../../../lib/utils";
import { StatusPill } from "../../shared/StatusPill";
import {
  Notice,
  PRIMARY_ACTION_CLASSES,
  RetryButton,
  SECONDARY_ACTION_CLASSES,
  SKELETON_CLASSES,
} from "../Notice";
import type { ProductTexts } from "../texts";
import { useProductLoad } from "../useProductLoad";
import { safeHttpsUrl } from "../safe-url";
import { fileRows, type FileRowModel } from "./naming";

/**
 * "Twoje pliki" card of a FILE product (option A, "Lista plików"): an
 * ownership header and one row per file with a format badge, a readable name
 * and a brand-coloured download link. Loading, error (with retry) and empty
 * states.
 */
export function FilesSection({
  accessId,
  accessToken,
  productName,
  texts,
  onDownload,
}: {
  accessId: string;
  accessToken: string;
  productName: string;
  texts: ProductTexts;
  /** Reports `panel_download`; never gets the URL. */
  onDownload: () => void;
}) {
  const headingId = useId();
  const { mutateAsync } = useMutation(
    rpcProvider.publicApi.userPanelGetFileDetails,
  );
  const [state, reload] = useProductLoad(async () => {
    const response = await mutateAsync({ accessId, accessToken });
    return response.result.case === "success"
      ? { ok: true as const, value: response.result.value.files }
      : { ok: false as const, failure: response.result.value! };
  }, accessId);

  // Only `https:` links become download targets.
  const rows =
    state.status === "ok"
      ? fileRows(
          state.value.filter((url) => safeHttpsUrl(url) != null),
          productName,
          texts.file,
        )
      : [];

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={state.status === "loading"}
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-(--panel-border) bg-(--panel-surface) p-4 text-(--panel-fg) sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="flex items-center gap-2 text-base font-semibold">
          {texts.yourFiles}
          {state.status === "ok" && rows.length > 0 && (
            <span className="rounded-full bg-(--panel-surface-2) px-2 py-0.5 text-xs font-medium text-(--panel-muted)">
              {rows.length}
            </span>
          )}
        </h3>
        <StatusPill status="paid" variant="ok" label={texts.purchased} />
      </div>

      {state.status === "loading" && (
        <div role="status" aria-label={texts.filesLoading} className="flex items-center gap-3">
          <span aria-hidden="true" className={cn(SKELETON_CLASSES, "size-11 shrink-0 rounded-lg")} />
          <span aria-hidden="true" className="flex flex-1 flex-col gap-2">
            <span className={cn(SKELETON_CLASSES, "h-3 w-1/2")} />
            <span className={cn(SKELETON_CLASSES, "h-3 w-1/3")} />
          </span>
          <span aria-hidden="true" className={cn(SKELETON_CLASSES, "hidden h-11 w-32 rounded-lg sm:block")} />
        </div>
      )}

      {(state.status === "error" || state.status === "failure") && (
        <Notice
          role="alert"
          tone="danger"
          title={texts.fileError}
          description={texts.fileErrorHelp}
          action={<RetryButton onClick={() => reload()}>{texts.retry}</RetryButton>}
        />
      )}

      {state.status === "ok" && rows.length === 0 && (
        <Notice tone="info" title={texts.noFiles} description={texts.noFilesHelp} />
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-(--panel-border)">
          {rows.map((row, index) => (
            <FileRow
              key={`${index}-${row.url}`}
              row={row}
              single={rows.length === 1}
              texts={texts}
              onDownload={onDownload}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FileRow({
  row,
  single,
  texts,
  onDownload,
}: {
  row: FileRowModel;
  single: boolean;
  texts: ProductTexts;
  onDownload: () => void;
}) {
  const label = single
    ? row.format
      ? texts.downloadFormat(row.format)
      : texts.downloadFile
    : texts.download;
  return (
    <li className="flex min-w-0 flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-(--panel-border) bg-(--panel-surface-2) text-(--panel-muted)"
        >
          <FileIcon className="size-4" />
          <span className="text-[9px] leading-none font-bold tracking-wide">
            {row.format ?? texts.fileFormatUnknown}
          </span>
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold break-words">{row.title}</span>
          {row.fileName && (
            <span className="truncate text-xs text-(--panel-muted)" title={row.fileName}>
              {row.fileName}
            </span>
          )}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          download
          onClick={onDownload}
          aria-label={single ? undefined : `${texts.download}: ${row.title}`}
          className={cn(PRIMARY_ACTION_CLASSES, "flex-1 sm:flex-none")}
        >
          <Download className="size-4" aria-hidden="true" />
          {label}
        </a>
        {row.format === "PDF" && (
          <a
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={texts.openInBrowser(row.title)}
            className={SECONDARY_ACTION_CLASSES}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {texts.open}
          </a>
        )}
      </div>
    </li>
  );
}
