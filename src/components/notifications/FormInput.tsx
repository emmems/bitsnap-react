import { Input } from "@/src/ui/input";
import { cn } from "@/src/lib/utils";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Label } from "@radix-ui/react-label";
import {
    CheckCircleIcon,
    CircleAlertIcon,
    TriangleAlertIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/src/ui/button";
import { Spinner } from "@/src/ui/spinner";
import type { ComponentClassNames, CustomizationTexts } from "./types";
import { DEFAULT_TEXTS } from "./constants";
import type { ReactNode } from "react";

interface FormInputProps {
    isLoading: boolean;
    submit: (email: string, phone: string, agreement: boolean) => void;
    errMsg: string;
    agreementLack?: boolean;
    warnMsg: string;
    isSubmited: boolean;
    showPhoneInput?: boolean;
    agreementText?: string | ReactNode;
    className?: ComponentClassNames;
    texts?: CustomizationTexts;
}

export function FormInput({
    submit,
    isLoading,
    errMsg,
    warnMsg,
    isSubmited,
    agreementLack,
    showPhoneInput = true,
    agreementText,
    className,
    texts,
}: FormInputProps) {
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [isChecked, setIsChecked] = useState(false);

    const [parent] = useAutoAnimate();

    function submitForm(e: FormEvent) {
        e.preventDefault();
        submit(email, phone, isChecked);
    }

    return (
        <form ref={parent} onSubmit={submitForm} className={className?.formContainer}>
            <Label className="text-sm" htmlFor="email">
                {texts?.formEmailLabel ?? DEFAULT_TEXTS.formEmailLabel}
            </Label>
            <Input
                value={email}
                onChange={(newVal) => {
                    setEmail(newVal.currentTarget.value);
                }}
                id="email"
                className="mb-5 bg-white dark:bg-neutral-900"
                type="email"
                placeholder={texts?.formEmailPlaceholder ?? DEFAULT_TEXTS.formEmailPlaceholder}
            />

            {showPhoneInput && (
                <>
                    <Label className="text-sm" htmlFor="phone">
                        {texts?.formPhoneLabel ?? DEFAULT_TEXTS.formPhoneLabel}{" "}
                        <span className="text-neutral-600 dark:text-neutral-400">
                            {texts?.formPhoneOptional ?? DEFAULT_TEXTS.formPhoneOptional}
                        </span>
                    </Label>
                    <Input
                        value={phone}
                        onChange={(newVal) => {
                            setPhone(newVal.currentTarget.value);
                        }}
                        id="phone"
                        className="mb-3 bg-white dark:bg-neutral-900"
                        type="tel"
                        placeholder={texts?.formPhonePlaceholder ?? DEFAULT_TEXTS.formPhonePlaceholder}
                    />
                </>
            )}
            <div className="my-5 flex items-start gap-x-1.5">
                <input
                    className="cursor-pointer"
                    id="notification-marketing-consent"
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                        setIsChecked(!isChecked);
                    }}
                />
                <label
                    htmlFor="notification-marketing-consent"
                    className={cn(
                        "cursor-pointer text-xs leading-4 transition-colors md:text-sm md:leading-4",
                        agreementLack === true ? "text-amber-400" : "",
                    )}
                >
                    {agreementText}
                </label>
            </div>
            {errMsg.length > 0 && (
                <p className="mb-3 flex items-center gap-1 text-sm text-red-400">
                    <TriangleAlertIcon color="#ff6467" size={16} /> {errMsg}
                </p>
            )}
            {warnMsg.length > 0 && (
                <p className="mb-3 flex items-center gap-1 text-sm text-amber-400">
                    <CircleAlertIcon color="var(--color-amber-400)" size={16} /> {warnMsg}
                </p>
            )}
            <Button
                variant="default"
                disabled={isLoading}
                className={cn(
                    isLoading ? "cursor-not-allowed text-transparent" : "",
                    "relative",
                )}
            >
                {texts?.formSubmitButton ?? DEFAULT_TEXTS.formSubmitButton}
                {isLoading && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <Spinner />
                    </div>
                )}
            </Button>
            {isSubmited && (
                <div className="mt-3 flex items-center gap-3 text-sm text-green-400">
                    <CheckCircleIcon color="#00b366" size={22} />{" "}
                    {texts?.formSuccessMessage ?? DEFAULT_TEXTS.formSuccessMessage}
                </div>
            )}
        </form>
    );
}

