import { useEffect, useMemo, useState } from "react";
import {
  Bitsnap,
  BitsnapCheckout,
  type CartPresentation,
  type CheckoutAppearance,
} from "bitsnap-react";
import { BitsnapConsent } from "bitsnap-react/consent";
import { clearCart, seedCart } from "./mocks";
import "./styles.css";

type Scenario =
  | "default"
  | "dark"
  | "light"
  | "tokens"
  | "elements"
  | "external-css"
  | "custom"
  | "host"
  | "shadcn";

const scenarios: Record<Scenario, CheckoutAppearance | undefined> = {
  default: undefined,
  dark: { theme: "dark" },
  light: { theme: "light" },
  tokens: {
    tokens: {
      fontFamily: '"Georgia", "Times New Roman", serif',
      background: "#1b2a4a",
      surface: "#24365c",
      foreground: "#eef3ff",
      mutedForeground: "#9fb0d0",
      border: "#3d5a8f",
      buttonBackground: "#f5a524",
      buttonForeground: "#1b2a4a",
      buttonHoverBackground: "#ffc95c",
      hoverSurface: "#33497a",
      overlay: "rgb(10 15 30 / 0.6)",
      error: "#ff6b6b",
      radius: "4px",
    },
  },
  elements: {
    elements: {
      title: { style: { fontFamily: '"Courier New", monospace' } },
      totalValue: { style: { fontFamily: '"Courier New", monospace' } },
      checkoutButton: { className: "example-checkout-button" },
      countryTrigger: { className: "example-country-trigger" },
    },
  },
  "external-css": {
    theme: "light",
    elements: {
      checkoutButton: { className: "external-checkout-button" },
      countryOption: { className: "external-country-option" },
    },
  },
  // Square corners, a brand button, a darker control outline, no panel shadow.
  custom: {
    theme: "light",
    tokens: {
      radius: "0px",
      panelRadius: "0px",
      controlRadius: "0px",
      buttonRadius: "0px",
      buttonBackground: "#c2410c",
      buttonHoverBackground: "#9a3412",
      buttonForeground: "#ffffff",
      buttonFontSize: "15px",
      controlBorder: "#3f3f46",
      panelShadow: "none",
    },
  },
  // `?theme=host`: every value is one of the host page's own variables
  // (`styles.css`, `html.host-site`), so the cart follows the page's dark
  // mode, switched by a class on <html>, with no JS.
  host: {
    tokens: {
      fontFamily: "var(--site-font)",
      background: "var(--site-bg)",
      surface: "var(--site-surface)",
      foreground: "var(--site-fg)",
      mutedForeground: "var(--site-muted)",
      border: "var(--site-border)",
      controlBorder: "var(--site-input)",
      hoverSurface: "var(--site-hover)",
      buttonBackground: "var(--site-brand)",
      buttonForeground: "var(--site-brand-fg)",
      buttonHoverBackground: "var(--site-brand-hover)",
      focusRing: "var(--site-ring)",
      skeleton: "var(--site-skeleton)",
      sale: "var(--site-sale)",
      error: "var(--site-error)",
      radius: "var(--site-radius)",
      colorScheme: "var(--site-scheme)",
    },
  },
  // `?theme=shadcn`: a shadcn/ui site. The tokens point at the site's own
  // shadcn variables, whose `.dark` rule would also match a bare `dark` class
  // on the cart root (19a review B1, S1).
  shadcn: {
    tokens: {
      background: "var(--background)",
      surface: "var(--card)",
      foreground: "var(--foreground)",
      mutedForeground: "var(--muted-foreground)",
      border: "var(--border)",
      controlBorder: "var(--input)",
      hoverSurface: "var(--accent)",
      buttonBackground: "var(--primary)",
      buttonForeground: "var(--primary-foreground)",
      buttonHoverBackground: "var(--primary)",
      focusRing: "var(--ring)",
      skeleton: "var(--muted)",
      error: "var(--destructive)",
      sale: "var(--destructive)",
      radius: "var(--radius)",
      colorScheme: "var(--scheme)",
    },
  },
};

export default function App({
  initialScenario = "default",
  initialPresentation = "drawer",
  locale,
  openOnLoad = false,
  consent = false,
}: {
  initialScenario?: Scenario;
  initialPresentation?: CartPresentation;
  locale?: string;
  openOnLoad?: boolean;
  consent?: boolean;
}) {
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const [presentation, setPresentation] = useState<CartPresentation>(initialPresentation);

  useEffect(() => {
    if (openOnLoad) {
      Bitsnap.showCart();
    }
  }, [openOnLoad]);
  const [withProducts, setWithProducts] = useState(true);
  const [appearance, setAppearance] = useState<CheckoutAppearance | undefined>(
    scenarios[initialScenario],
  );

  // Changing the appearance while the cart is open has to be picked up.
  function applyScenario(next: Scenario) {
    setScenario(next);
    setAppearance(scenarios[next]);
  }

  function toggleProducts(next: boolean) {
    setWithProducts(next);
    if (next) {
      seedCart();
    } else {
      clearCart();
    }
  }

  const style = useMemo(
    () => ({ padding: 32, display: "grid", gap: 16, maxWidth: 720 }),
    [],
  );

  return (
    <main style={style}>
      <h1 style={{ margin: 0 }}>Bitsnap checkout appearance</h1>

      <p style={{ margin: 0 }}>
        The library is consumed as a package: the stylesheet is
        <code> bitsnap-react/dist/index.css</code> and no Tailwind source is
        compiled here.
      </p>

      <fieldset style={{ display: "grid", gap: 8, border: 0, padding: 0 }}>
        <legend>Appearance</legend>
        {(Object.keys(scenarios) as Scenario[]).map((key) => (
          <label key={key} style={{ display: "flex", gap: 8 }}>
            <input
              type="radio"
              name="scenario"
              checked={scenario === key}
              onChange={() => applyScenario(key)}
            />
            {key}
          </label>
        ))}
      </fieldset>

      <fieldset style={{ display: "grid", gap: 8, border: 0, padding: 0 }}>
        <legend>Presentation</legend>
        {(["drawer", "dialog"] as const).map((key) => (
          <label key={key} style={{ display: "flex", gap: 8 }}>
            <input
              type="radio"
              name="presentation"
              checked={presentation === key}
              onChange={() => setPresentation(key)}
            />
            {key}
          </label>
        ))}
      </fieldset>

      {(scenario === "host" || scenario === "shadcn") && (
        <button
          type="button"
          className="host-toggle"
          // The host's own switch: a class on <html>, nothing passed to the cart.
          onClick={() => document.documentElement.classList.toggle("dark")}
        >
          Toggle site dark mode
        </button>
      )}

      <label style={{ display: "flex", gap: 8 }}>
        <input
          type="checkbox"
          checked={withProducts}
          onChange={(event) => toggleProducts(event.currentTarget.checked)}
        />
        cart with products
      </label>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <BitsnapCheckout
          projectID="example-project"
          appearance={appearance}
          presentation={presentation}
          locale={locale}
        >
          <span>🛒 Open cart</span>
        </BitsnapCheckout>
        <span>badge shows the seeded cart</span>
      </div>
      {/* Preview mode: shown on every load, no cookie, nothing sent. */}
      {consent && <BitsnapConsent preview locale="pl" theme="light" />}
    </main>
  );
}
