import { AnimatePresence, motion } from "framer-motion";
import { type MutableRefObject, useEffect, useRef, useState } from "react";

export interface CountrySelectorProps {
    id: string;
    open: boolean;
    disabled?: boolean;
    onToggle: () => void;
    onChange: (value: string) => void;
    selectedValue: string;
    countries: { name: string; code: string }[];
}

function CountrySelector(
    {
        id,
        open,
        disabled = false,
        onToggle,
        onChange,
        selectedValue,
        countries
    }: CountrySelectorProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const mutableRef = ref as MutableRefObject<HTMLDivElement | null>;

        const handleClickOutside = (event: MouseEvent) => {
            if (
                mutableRef.current &&
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error
                !mutableRef.current.contains(event.target) &&
                open
            ) {
                onToggle();
                setQuery("");
            }
        };

        window.document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [ref]);

    useEffect(() => {
        if (selectedValue == null && countries.length > 0) {
            onChange(countries[0].code);
        }
    }, []);

    const [query, setQuery] = useState("");

    return (
        <div ref={ref}>
            <div className="relative">
                <button
                    type="button"
                    className={`${disabled ? "bg-neutral-100" : "bg-extra-light-white"
                        } relative w-full rounded-2xl shadow-sm pl-8 pr-10 py-3 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    aria-haspopup="listbox"
                    aria-expanded="true"
                    aria-labelledby="listbox-label"
                    onClick={onToggle}
                    disabled={disabled}
                >
                    <span className="truncate flex items-center">
                        <img
                            alt={`${selectedValue}`}
                            src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${selectedValue}.svg`}
                            className={"inline mr-2 h-4 rounded-sm"}
                        />
                        {countries.find(el => el.code === selectedValue)?.name}
                    </span>
                    <span
                        className={`absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none ${disabled ? "hidden" : ""
                            }`}
                    >
                        <svg
                            className="h-5 w-5 text-light-purple"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                fillRule="evenodd"
                                d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </span>
                </button>

                <AnimatePresence>
                    {open && (
                        <motion.ul
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.1 }}
                            className="absolute z-10 -mt-80 w-full dark:bg-neutral-800 bg-white shadow-lg max-h-80 rounded-md text-body-regular ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-body-regular"
                            tabIndex={-1}
                            role="listbox"
                            aria-labelledby="listbox-label"
                            aria-activedescendant="listbox-option-3"
                        >
                            <div className="sticky top-0 z-10 bg-white dark:bg-neutral-800">
                                <li className="dark:text-neutral-200 text-neutral-900 cursor-default select-none relative py-2 px-3">
                                    <input
                                        type="search"
                                        name="search"
                                        autoComplete={"off"}
                                        className="block w-full outline-none sm:text-body-regular dark:text-neutral-400 text-dark-blue bg-transparent border-light-purple rounded-md placeholder:text-light-purple"
                                        placeholder={"Znajdź kraj"}
                                        onChange={(e) => setQuery(e.target.value)}
                                    />
                                </li>
                                <hr />
                            </div>

                            <div
                                className={
                                    "max-h-64 scrollbar scrollbar-track-gray-100 scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-600 scrollbar-thumb-rounded scrollbar-thin overflow-y-scroll"
                                }
                            >
                                {countries.filter((country) =>
                                    country.name.toLowerCase().startsWith(query.toLowerCase())
                                ).length === 0 ? (
                                    <li className="text-light-purple cursor-default select-none relative py-2 pl-3 pr-9">
                                        No countries found
                                    </li>
                                ) : (
                                    countries.filter((country) =>
                                        country.name.toLowerCase().startsWith(query.toLowerCase())
                                    ).map((value, index) => {
                                        return (
                                            <li
                                                key={`${id}-${index}`}
                                                className="text-dark-blue cursor-default select-none relative py-2 pl-3 pr-9 flex items-center hover:bg-extra-light-white transition"
                                                id="listbox-option-0"
                                                role="option"
                                                onClick={() => {
                                                    onChange(value.code);
                                                    setQuery("");
                                                    onToggle();
                                                }}
                                            >
                                                <img
                                                    alt={`${value.code}`}
                                                    src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${value.code}.svg`}
                                                    className={"inline mr-2 h-4 rounded-sm"}
                                                />

                                                <span className="font-normal truncate">
                                                    {value.name}
                                                </span>
                                                {value.code === selectedValue ? (
                                                    <span
                                                        className="text-blue-600 absolute inset-y-0 right-0 flex items-center pr-8">
                                                        <svg
                                                            className="h-5 w-5"
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            viewBox="0 0 20 20"
                                                            fill="currentColor"
                                                            aria-hidden="true"
                                                        >
                                                            <path
                                                                fillRule="evenodd"
                                                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                                clipRule="evenodd"
                                                            />
                                                        </svg>
                                                    </span>
                                                ) : null}
                                            </li>
                                        );
                                    })
                                )}
                            </div>
                        </motion.ul>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}


export default CountrySelector