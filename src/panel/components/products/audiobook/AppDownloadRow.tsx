import { Smartphone } from "lucide-react";
import type { ProductTexts } from "../texts";

const APP_STORE_URL = "https://apps.apple.com/us/app/bitsnap/id6741902807";
const GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.bitsnap.Bitsnap";

/** One quiet block: "Słuchaj w aplikacji Bitsnap" with the store badges. */
export function AppDownloadRow({
  offline,
  texts,
}: {
  /** The seller allows downloading chapters in the app. */
  offline: boolean;
  texts: ProductTexts;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-(--panel-border) bg-(--panel-surface) p-4 text-(--panel-fg)">
      <Smartphone className="mt-0.5 size-5 shrink-0 text-(--panel-muted)" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <p className="text-sm font-semibold">{texts.appTitle}</p>
          <p className="text-xs text-(--panel-muted)">
            {offline ? texts.appOffline : texts.appOnline}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)"
          >
            <img width={100} height={33} src="https://bitsnap.pl/appstore.svg" alt={texts.appStoreAlt} />
          </a>
          <a
            href={GOOGLE_PLAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)"
          >
            <img width={100} height={33} src="https://bitsnap.pl/playstore.svg" alt={texts.googlePlayAlt} />
          </a>
        </div>
      </div>
    </div>
  );
}
