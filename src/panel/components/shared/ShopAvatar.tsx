import { useState } from "react";
import { cn } from "../../../lib/utils";
import type { ShopOption } from "../../shop-filter";

export type ShopAvatarProps = {
  name: string;
  imageUrl?: string;
  imageDarkUrl?: string;
  /** `"sm"` = 20 px (pills, compact rows), `"md"` = 24 px. */
  size?: "sm" | "md";
  className?: string;
};

function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "S";
  return Array.from(trimmed)[0]!.toLocaleUpperCase();
}

/**
 * Compact circular shop avatar (20–24 px) with light/dark logo switching.
 * Always decorative beside the shop name (`alt=""`); falls back to the shop's
 * initial on `--panel-surface-2` when no image is set or loading fails.
 */
export function ShopAvatar({
  name,
  imageUrl,
  imageDarkUrl,
  size = "sm",
  className,
}: ShopAvatarProps) {
  const [failed, setFailed] = useState<readonly string[]>([]);

  const light = (imageUrl || imageDarkUrl || "").trim();
  const dark = (imageDarkUrl || imageUrl || "").trim();
  const works = (url: string) => url !== "" && !failed.includes(url);
  const lightSrc = works(light) ? light : works(dark) ? dark : "";
  const darkSrc = works(dark) ? dark : works(light) ? light : "";

  const onError = (url: string) => () =>
    setFailed((urls) => (urls.includes(url) ? urls : [...urls, url]));

  const sizeClass = size === "md" ? "size-6 text-xs" : "size-5 text-[11px]";

  if (lightSrc === "" && darkSrc === "") {
    return (
      <span
        aria-hidden="true"
        data-shop-avatar="initial"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border border-(--panel-border) bg-(--panel-surface-2) font-semibold leading-none text-(--panel-fg) select-none",
          sizeClass,
          className,
        )}
      >
        {initialOf(name)}
      </span>
    );
  }

  const imageClass = "size-full object-contain p-0.5";
  return (
    <span
      aria-hidden="true"
      data-shop-avatar="image"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-(--panel-border) bg-(--panel-surface)",
        sizeClass,
        className,
      )}
    >
      {lightSrc === darkSrc ? (
        <img
          src={lightSrc}
          alt=""
          draggable={false}
          onError={onError(lightSrc)}
          className={imageClass}
        />
      ) : (
        <>
          <img
            src={lightSrc}
            alt=""
            draggable={false}
            onError={onError(lightSrc)}
            className={cn(imageClass, "dark:hidden")}
          />
          <img
            src={darkSrc}
            alt=""
            draggable={false}
            onError={onError(darkSrc)}
            className={cn(imageClass, "hidden dark:block")}
          />
        </>
      )}
    </span>
  );
}

export type ShopMarkProps = {
  shop: Pick<ShopOption, "name" | "imageUrl" | "imageDarkUrl">;
  fallbackName?: string;
  size?: "sm" | "md";
  className?: string;
};

/** Shop avatar + truncated shop name for order rows and headers. */
export function ShopMark({
  shop,
  fallbackName = "Sklep",
  size = "sm",
  className,
}: ShopMarkProps) {
  const displayName = shop.name.trim() || fallbackName;
  return (
    <span
      data-shop-mark=""
      title={displayName}
      className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5", className)}
    >
      <ShopAvatar
        name={displayName}
        imageUrl={shop.imageUrl}
        imageDarkUrl={shop.imageDarkUrl}
        size={size}
      />
      <span className="min-w-0 truncate text-(--panel-fg)">{displayName}</span>
    </span>
  );
}
