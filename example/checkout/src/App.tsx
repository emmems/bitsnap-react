import { useMemo, useState } from "react";
import { BitsnapCheckout, type CheckoutAppearance } from "bitsnap-react";
import { clearCart, seedCart } from "./mocks";
import "./styles.css";

type Scenario =
  | "default"
  | "dark"
  | "light"
  | "tokens"
  | "elements"
  | "external-css";

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
};

export default function App({
  initialScenario = "default",
}: {
  initialScenario?: Scenario;
}) {
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
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

      <label style={{ display: "flex", gap: 8 }}>
        <input
          type="checkbox"
          checked={withProducts}
          onChange={(event) => toggleProducts(event.currentTarget.checked)}
        />
        cart with products
      </label>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <BitsnapCheckout projectID="example-project" appearance={appearance}>
          <span>🛒 Open cart</span>
        </BitsnapCheckout>
        <span>badge shows the seeded cart</span>
      </div>
    </main>
  );
}
