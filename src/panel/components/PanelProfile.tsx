import { useState } from "react";
import { LogOut } from "lucide-react";
import { getLocale, setLocale } from "../../components/checkout/locale";
import { getPanelTexts } from "../texts";

interface PanelProfileComponentProps { email: string | null; logout: () => void; onLocaleChange?: () => void; }

export default function PanelProfileComponent({ email, logout, onLocaleChange }: PanelProfileComponentProps) {
  const [locale, updateLocale] = useState(getLocale);
  const texts = getPanelTexts(locale);
  return <section className="w-full max-w-xl">
    <h3 className="text-2xl">{texts.accountNavLabel}</h3>
    <h4 className="mt-6 mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">{texts.profileHeading}</h4>
    <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="p-4"><p className="text-sm text-neutral-600 dark:text-neutral-400">{texts.emailLabel}</p><p className="mt-1 break-words">{email || texts.noData}</p></div>
      <label className="flex min-h-11 flex-wrap items-center justify-between gap-3 p-4">
        <span>{texts.languageLabel}</span>
        <select value={locale.toLowerCase().startsWith("en") ? "en-US" : "pl-PL"} onChange={(event) => { setLocale(event.target.value); updateLocale(event.target.value); onLocaleChange?.(); }} className="min-h-11 rounded-md border border-neutral-300 bg-white px-3 focus-visible:outline-2 focus-visible:outline-current dark:border-neutral-700 dark:bg-neutral-900">
          <option value="pl-PL">{texts.polishLanguage}</option><option value="en-US">{texts.englishLanguage}</option>
        </select>
      </label>
    </div>
    <button type="button" onClick={logout} className="mt-6 flex min-h-11 w-full items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-current dark:border-neutral-800 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-neutral-800"><LogOut className="h-5 w-5" aria-hidden="true" />{texts.logout}</button>
  </section>;
}
