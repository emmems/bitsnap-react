import {
  BitsnapConsent,
  createConsent,
  mergeTexts,
  useConsent,
  type BitsnapConsentApi,
  type BitsnapConsentProps,
  type ConsentChangeDetail,
  type ConsentConfig,
  type ConsentState,
} from "bitsnap-react/consent";

/** Consumer fixture for the cookie consent banner of this package. */

const config: Partial<ConsentConfig> = {
  version: 2,
  categories: { analytics: true, marketing: true, preferences: false },
  services: [{ name: "Google Analytics", category: "analytics", cookies: ["_ga"] }],
  texts: { pl: { title: "Szanujemy Twoją prywatność" } },
};

const props: BitsnapConsentProps = {
  projectKey: "pk_live_1",
  theme: "auto",
  locale: "pl",
  position: "bottom-right",
  privacyPolicyUrl: "/polityka-prywatnosci",
  scope: "project",
  config,
};

function CookieSettingsLink() {
  const { consent, decided, open, acceptAll } = useConsent();
  const marketing: boolean = consent?.c.marketing ?? false;
  return (
    <>
      <BitsnapConsent {...props} />
      <button onClick={decided ? open : acceptAll}>{marketing ? "On" : "Off"}</button>
    </>
  );
}

const api: BitsnapConsentApi = createConsent({ gcm: "on" });
const off: () => void = api.on("change", (detail: ConsentChangeDetail) => void detail.action);
const state: ConsentState | null = api.get();

export const view = <CookieSettingsLink />;
export const title: string = mergeTexts("pl").title;
export { off, state };
