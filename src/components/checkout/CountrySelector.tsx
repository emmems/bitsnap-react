import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/ui/select";
import { cn } from "@/src/lib/utils";
import { useCheckoutAppearance, useCheckoutSlot } from "./appearance.context";

export interface CountrySelectorProps {
  id: string;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  selectedValue: string;
  countries: { name: string; code: string }[];
}

function CountrySelector({
  id,
  open,
  disabled = false,
  onToggle,
  onChange,
  selectedValue,
  countries,
}: CountrySelectorProps) {
  const [query, setQuery] = useState("");

  const {
    isCustomized,
    boundaryClassName,
    boundaryStyle,
    dropdownStyle,
  } = useCheckoutAppearance();
  const countryTrigger = useCheckoutSlot("countryTrigger");
  const countryDropdown = useCheckoutSlot("countryDropdown");
  const countrySearch = useCheckoutSlot("countrySearch");
  const countryOption = useCheckoutSlot("countryOption");

  useEffect(() => {
    if (selectedValue == null && countries.length > 0) {
      onChange(countries[0].code);
    }
  }, []);

  const filteredCountries = countries.filter((country) =>
    country.name.toLowerCase().startsWith(query.toLowerCase()),
  );

  const selectedCountry = countries.find((el) => el.code === selectedValue);

  return (
    <Select
      value={selectedValue}
      onValueChange={(value) => {
        onChange(value);
        setQuery("");
      }}
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen !== open) {
          onToggle();
        }
        if (!isOpen) {
          setQuery("");
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger
        data-bitsnap-checkout-slot="countryTrigger"
        theme="bare"
        className={cn(
          disabled
            ? "bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700"
            : "",
          "w-full rounded-md",
          countryTrigger.className,
        )}
        style={countryTrigger.style}
      >
        <SelectValue>
          {selectedCountry && (
            <span className="truncate flex items-center">
              <img
                alt={selectedValue}
                src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${selectedValue}.svg`}
                className="inline mr-2 h-4 rounded-sm"
              />
              {selectedCountry.name}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        data-bitsnap-checkout={isCustomized ? "dropdown" : undefined}
        data-bitsnap-checkout-slot={isCustomized ? "countryDropdown" : undefined}
        className={cn(
          // The dropdown is portalled outside of the checkout root, so it only
          // joins the checkout theme boundary once the caller opts into an
          // appearance. Without it the content renders exactly as before.
          isCustomized ? "bitsnap-react" : "",
          boundaryClassName,
          "w-full max-h-80 max-w-[350px] z-[999999]",
          countryDropdown.className,
        )}
        style={{
          ...(isCustomized ? { ...boundaryStyle, ...dropdownStyle } : undefined),
          ...countryDropdown.style,
        }}
        position="popper"
      >
        <div
          data-bitsnap-checkout-slot="countrySearch"
          className={cn("sticky top-0 z-10 p-1 border-b", countrySearch.className)}
          style={countrySearch.style}
        >
          <input
            type="search"
            name="search"
            autoComplete="off"
            className="block w-full outline-none sm:text-body-regular bg-transparent rounded-md px-2 py-1.5"
            placeholder="Znajdź kraj"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filteredCountries.length === 0 ? (
            <div className="cursor-default select-none relative py-2 pl-3 pr-9 text-sm">
              No countries found
            </div>
          ) : (
            filteredCountries.map((country) => (
              <SelectItem
                key={`${id}-${country.code}`}
                data-bitsnap-checkout-slot="countryOption"
                value={country.code}
                className={cn(
                  "cursor-default select-none relative py-2 pl-3 pr-9 flex items-center transition",
                  countryOption.className,
                )}
                style={countryOption.style}
              >
                <img
                  alt={country.code}
                  src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${country.code}.svg`}
                  className="inline mr-2 h-4 rounded-sm"
                />
                <span className="font-normal truncate">{country.name}</span>
              </SelectItem>
            ))
          )}
        </div>
      </SelectContent>
    </Select>
  );
}

export default CountrySelector;
