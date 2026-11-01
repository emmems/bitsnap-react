import { LogOut } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { LoginBrandLogo, useLoginBranding } from "../../ui/email-code-login/LoginBrandLogo";
import type { GetThemeOutput, PanelScreen } from "../types";
import { getPanelTexts } from "../texts";
import { panelNavItems, navScreen } from "./nav/items";

interface PanelProductHeaderComponentProps {
  activeScreen: PanelScreen;
  setActiveScreen: (screen: PanelScreen) => void;
  setParams: (params: { product?: string; state: PanelScreen }) => void;
  styles: CSSProperties;
  theme?: GetThemeOutput;
  logout: () => void;
  email?: string | null;
  projectID?: string;
  /** Shows "Wiadomości": the buyer has chat products or a chat URL. */
  showMessages?: boolean;
}

export default function PanelProductHeaderComponent({
  activeScreen,
  setActiveScreen,
  setParams,
  theme,
  logout,
  email,
  projectID,
  showMessages = false,
}: PanelProductHeaderComponentProps) {
  const texts = getPanelTexts();
  const { data: branding } = useLoginBranding(projectID ?? "", Boolean(projectID));
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 bg-white px-4 md:h-dvh md:w-56 md:flex-col md:items-stretch md:border-r md:border-b-0 md:py-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex min-w-0 items-center gap-3 md:mb-6 md:flex-col md:items-start">
        <LoginBrandLogo projectId={projectID} logoUrl={theme?.logoURL} logoDarkUrl={theme?.logoDarkURL} name={branding?.name} className="shrink-0" />
        {branding?.name && <span title={branding.name} className="truncate text-sm font-medium md:line-clamp-2 md:whitespace-normal">{branding.name}</span>}
      </div>
      <nav aria-label={texts.navigationLabel} className="fixed inset-x-0 bottom-0 z-10 flex h-[calc(56px+env(safe-area-inset-bottom))] items-start justify-around border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:static md:h-auto md:flex-1 md:flex-col md:justify-start md:gap-2 md:border-0 md:bg-transparent md:pb-0 dark:border-neutral-800 dark:bg-neutral-900">
        {panelNavItems.filter(({ screen }) => screen !== "messages" || showMessages).map(({ screen, label, icon: Icon }) => {
          const active = navScreen(activeScreen) === screen;
          return (
            <button
              key={screen}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setActiveScreen(screen);
                setParams({ product: undefined, state: screen });
              }}
            className={cn("flex h-14 min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current md:h-11 md:w-full md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-md md:px-3 md:text-sm", active ? "bg-neutral-100 font-semibold text-black dark:bg-neutral-800 dark:text-white" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800")}>
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{texts[label]}</span>
            </button>
          );
        })}
      </nav>
      <div className="hidden border-t border-neutral-200 pt-4 md:block dark:border-neutral-800">
        {email && <p title={email} className="mb-3 truncate text-sm text-neutral-600 dark:text-neutral-400">{email}</p>}
        <button type="button" onClick={logout} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-current dark:text-red-400 dark:hover:bg-neutral-800">
          <LogOut className="h-4 w-4" aria-hidden="true" />{texts.logout}
        </button>
      </div>
    </header>
  );
}
