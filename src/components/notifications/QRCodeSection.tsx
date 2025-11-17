import { cn } from "@/src/lib/utils";
import type { ComponentClassNames, CustomizationTexts } from "./types";
import { DEFAULT_TEXTS } from "./constants";
import { HOST } from "../checkout/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/ui/card";

interface QRCodeSectionProps {
  showQRCode?: boolean;
  isManaging?: boolean;
  className?: ComponentClassNames;
  texts?: CustomizationTexts;
}

export function QRCodeSection({
  showQRCode = true,
  isManaging,
  className,
  texts,
}: QRCodeSectionProps) {
  const isBrowser = typeof window !== "undefined";
  const darkMode = isBrowser
    ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? true
      : false
    : false;

  function getURL(isBrowser: boolean) {
    if (isBrowser) {
      return window.location.href;
    }
    return "";
  }

  if (!showQRCode) {
    return null;
  }

  return (
    <Card
      className={cn(
        "bg-beige-100 rounded-xl p-4 dark:bg-neutral-700",
        className?.qrCodeSection
      )}
    >
      <CardHeader>
        <CardTitle
          className={cn(
            "mb-3 text-base font-medium lg:text-lg",
            className?.qrCodeTitle
          )}
        >
          {texts?.qrCodeSubtitle ?? DEFAULT_TEXTS.qrCodeSubtitle}
          {" " + (texts?.qrCodeTitle ?? DEFAULT_TEXTS.qrCodeTitle)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-2">
        <div className="mt-1.5 mb-3 flex items-center gap-x-2">
          <a
            href="https://apps.apple.com/us/app/bitsnap/id6741902807"
            target="_blank"
            className="max-w-28 flex-1 basis-1/2 lg:max-w-36"
          >
            <img
              className="h-auto w-full"
              src={HOST + "/app-store-logo.png"}
              alt="Download on App Store"
            />
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.bitsnap.Bitsnap&pli=1"
            target="_blank"
            className="max-w-28 flex-1 basis-1/2 lg:max-w-36"
          >
            <img
              className="h-auto w-full"
              src={HOST + "/google-play-logo.png"}
              alt="Get in on Google Play"
            />
          </a>
        </div>
        {isBrowser && (
          <div className="flex items-center justify-center">
            <div
              className={cn(
                "flex min-w-[40%] flex-col items-center gap-2 rounded-xl bg-white p-2 dark:bg-neutral-900",
                className?.qrCodeContainer
              )}
            >
              <img
                className="mt-3 w-[80%] p-1 pt-3"
                src={
                  HOST +
                  `/api/qr-gen?url=${getURL(isBrowser)}&bgColor=${
                    !darkMode ? "F6F4F0" : "171717"
                  }&textColor=${!darkMode ? "000000" : "ffffff"}&margin=0`
                }
              />
              <p className="text-xs md:text-sm">
                {texts?.qrCodeScanText ?? DEFAULT_TEXTS.qrCodeScanText}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
