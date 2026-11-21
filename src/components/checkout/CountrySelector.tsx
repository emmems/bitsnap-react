import { useMemo } from "react";
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
  /** The cart's locale: country names are shown in it. */
  locale?: string;
}

/**
 * Country names in the cart's locale ("Polska" in a Polish cart), from
 * `Intl.DisplayNames`. The server's name stays when the runtime has no
 * `Intl.DisplayNames`, does not know the locale or the code, the code is
 * not a region code, or it is the unknown region `ZZ`.
 */
export function localCountryNames(
  countries: { name: string; code: string }[],
  locale: string | undefined,
): { name: string; code: string }[] {
  let names: Intl.DisplayNames;
  try {
    names = new Intl.DisplayNames(locale != null ? [locale] : undefined, {
      type: "region",
      fallback: "none",
    });
  } catch {
    return countries;
  }
  // `ZZ` is CLDR's "Unknown Region": named ("Nieznany region") even with
  // `fallback: "none"`. A code named like it is not a country to show.
  let unknown: string | undefined;
  try {
    unknown = names.of("ZZ");
  } catch {
    unknown = undefined;
  }
  return countries.map((country) => {
    try {
      const name = names.of(country.code.toUpperCase());
      return name != null && name.length > 0 && name !== unknown
        ? { ...country, name }
        : country;
    } catch {
      return country;
    }
  });
}

/**
 * The delivery country as a native `<select>` inside the panel (PLAN D4): no
 * portal, so the dialog's focus trap, scroll lock and Esc keep working, and
 * phones show their own picker. Names follow the cart's locale. A disabled first option with `chooseCountry`
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
  locale,
}: CountrySelectorProps) {
  const countryTrigger = useCheckoutSlot("countryTrigger");
  const shownCountries = useMemo(
    () => localCountryNames(countries, locale),
    [countries, locale],
  );
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
      {shownCountries.map((country) => (
        <option key={country.code} value={country.code}>
          {country.name}
        </option>
      ))}
    </select>
  );
}

export default CountrySelector;
