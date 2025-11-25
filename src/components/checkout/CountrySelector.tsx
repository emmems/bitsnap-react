import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/ui/select";
import { cn } from "@/src/lib/utils";

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

  useEffect(() => {
    if (selectedValue == null && countries.length > 0) {
      onChange(countries[0].code);
    }
  }, []);

  const filteredCountries = countries.filter((country) =>
    country.name.toLowerCase().startsWith(query.toLowerCase())
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
        className={cn(
          disabled
            ? "bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700"
            : "bg-extra-light-white dark:bg-neutral-900",
          "w-full rounded-md border-neutral-500"
        )}
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
        className="dark w-full max-h-80 max-w-[350px] dark:bg-neutral-800 bg-white z-[999999]"
        position="popper"
      >
        <div className="sticky top-0 z-10 bg-white dark:bg-neutral-800 p-1 border-b">
          <input
            type="search"
            name="search"
            autoComplete="off"
            className="block w-full outline-none sm:text-body-regular dark:text-neutral-400 text-dark-blue bg-transparent border-light-purple rounded-md placeholder:text-light-purple px-2 py-1.5"
            placeholder="Znajdź kraj"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filteredCountries.length === 0 ? (
            <div className="text-light-purple cursor-default select-none relative py-2 pl-3 pr-9 text-sm">
              No countries found
            </div>
          ) : (
            filteredCountries.map((country) => (
              <SelectItem
                key={`${id}-${country.code}`}
                value={country.code}
                className={cn(
                  "text-dark-blue cursor-default select-none relative py-2 pl-3 pr-9 flex items-center hover:bg-extra-light-white transition",
                  selectedValue === country.code
                    ? "bg-neutral-100 dark:bg-neutral-700"
                    : ""
                )}
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
