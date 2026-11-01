import { useState } from "react";
import { cn } from "@/src/lib/utils";
import { useQuery } from "@/src/rpc-provider";
import { getLoginBranding } from "../../gen/proto/public/v1/public_api-PublicApiService_connectquery";

/** Options every login surface passes through to {@link LoginBrandLogo}. */
export type LoginLogoOptions = {
  /** Shows the shop logo above the login. Default `true`; `false` hides it. */
  showLogo?: boolean;
  /** Logo for light backgrounds, instead of the one of the shop settings. */
  logoUrl?: string;
  /** Logo for dark backgrounds, instead of the one of the shop settings. */
  logoDarkUrl?: string;
};

export type LoginBrandLogoProps = LoginLogoOptions & {
  /**
   * Public project id (or notifications slug). The shop logo and name are
   * read once per page; none given means the Bitsnap logo.
   */
  projectId?: string;
  /** Shop name used as the alt text, when already known. */
  name?: string;
  className?: string;
};

const BOX = "flex h-10 items-center";
const IMAGE = "block max-h-10 max-w-48 w-auto object-contain";

/**
 * The dotted "b" of Bitsnap: one round dot per `M x y h0`, drawn with a round
 * cap of the dot's width. Follows the text colour, so it suits dark mode.
 */
function BitsnapLogo() {
  return (
    <span
      role="img"
      aria-label="Bitsnap"
      className="inline-flex items-center gap-1.5"
    >
      <svg
        aria-hidden="true"
        width="29"
        height="27"
        viewBox="0 0 33 30"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.04"
        strokeLinecap="round"
      >
        <path d="M20.2 1.8h0M22.8 6.2h0M22.8 10.6h0M22.8 15h0M22.8 19.4h0M22.8 23.8h0M20.2 28.2h0M27.1 10.6h0M27.1 15h0M27.1 19.4h0M31.5 15h0M1.5 1.8h0M5.4 1.8h0M9.3 1.8h0M13.2 1.8h0M5.4 15h0M9.3 15h0M13.2 15h0M5.4 28.2h0M9.3 28.2h0M13.2 28.2h0M1.5 6.2h0M1.5 10.6h0M1.5 15h0M1.5 19.4h0M1.5 23.8h0M1.5 28.2h0M16.7 19.4h0M16.7 23.8h0M16.7 6.2h0M16.7 10.6h0" />
      </svg>
      <span aria-hidden="true" className="text-xl tracking-wider">
        bitsnap.
      </span>
    </span>
  );
}

/**
 * Logo at the top of every login step: the shop's own (light and dark
 * variant), or Bitsnap's when the shop has none, the request fails or there is
 * no project. The box keeps its height while the logo loads, so the form does
 * not jump.
 */
export function LoginBrandLogo({
  projectId,
  name,
  showLogo = true,
  logoUrl,
  logoDarkUrl,
  className,
}: LoginBrandLogoProps) {
  const [broken, setBroken] = useState(false);
  const given = logoUrl || logoDarkUrl;
  const project = projectId?.trim() ?? "";
  const { data, isPending } = useQuery(
    getLoginBranding,
    { projectId: project },
    {
      enabled: showLogo && !given && project !== "",
      staleTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  if (!showLogo) return null;

  // Waiting for the shop: keep the space, show nothing yet.
  if (!given && project !== "" && isPending) {
    return <div className={cn(BOX, className)} aria-hidden="true" />;
  }

  const light = (given ? logoUrl || logoDarkUrl : data?.logoUrl || data?.logoDarkUrl) || "";
  const dark = (given ? logoDarkUrl || logoUrl : data?.logoDarkUrl || data?.logoUrl) || "";
  const alt = name || data?.name || "";

  if ((light === "" && dark === "") || broken) {
    return (
      <div className={cn(BOX, className)}>
        <BitsnapLogo />
      </div>
    );
  }

  const onError = () => setBroken(true);
  return (
    <div className={cn(BOX, className)}>
      {light === dark ? (
        <img src={light} alt={alt} className={IMAGE} draggable={false} onError={onError} />
      ) : (
        <>
          <img src={light} alt={alt} className={cn(IMAGE, "dark:hidden")} draggable={false} onError={onError} />
          <img src={dark} alt={alt} className={cn(IMAGE, "hidden dark:block")} draggable={false} onError={onError} />
        </>
      )}
    </div>
  );
}
