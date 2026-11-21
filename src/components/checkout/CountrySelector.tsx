import { useCheckoutSlot } from "./appearance.context";
import { cx } from "./lib/cx";
import { useCheckoutText } from "./texts.context";

export interface CountrySelectorProps {
  id: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  selectedValue: string;
  countries: { name: string; code: string }[];
  /** Id of the hint shown while no country is chosen. */
  describedBy?: string;
}

/**
 * The delivery country as a native `<select>` inside the panel (PLAN D4): no
 * portal, so the dialog's focus trap, scroll lock and Esc keep working, and
 * phones show their own picker. A disabled first option with `chooseCountry`
 * stands in while no country (or one the shop does not ship to) is chosen,
 * so the control never shows a wrong country. `countryTrigger` styles the
 * select; `countryDropdown`, `countrySearch` and `countryOption` have no
 * element any more.
 */
function CountrySelector({
  id,
  disabled = false,
  onChange,
  selectedValue,
  countries,
  describedBy,
}: CountrySelectorProps) {
  const countryTrigger = useCheckoutSlot("countryTrigger");
  const chooseCountryText = useCheckoutText("chooseCountry");
  const known = countries.some((country) => country.code === selectedValue);

  return (
    <select
      id={id}
      data-bitsnap-checkout-slot="countryTrigger"
      className={cx("bsc-select", countryTrigger.className)}
      style={countryTrigger.style}
      value={known ? selectedValue : ""}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      {!known && (
        <option value="" disabled>
          {chooseCountryText}
        </option>
      )}
      {countries.map((country) => (
        <option key={country.code} value={country.code}>
          {country.name}
        </option>
      ))}
    </select>
  );
}

export default CountrySelector;
