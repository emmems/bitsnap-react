import React, { useEffect, useId, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from '../../ui/dialog';
import { TurnstileChallenge } from '../../captcha/TurnstileChallenge';
import {
    contactFormContext,
    useContactForm,
    type UseContactFormOptions,
} from './useContactForm';
import {
    contactCSS,
    resolveContactAppearance,
    type ContactAppearance,
    type ContactSlotName,
} from './appearance';
import { resolveContactTexts, type ContactTexts } from './texts';
export type ContactFormProps = UseContactFormOptions & {
    mode?: 'inline' | 'modal' | 'floating';
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactElement;
    launcher?: {
        label?: string;
        position?: 'bottom-right' | 'bottom-left';
    };
    locale?: string;
    texts?: Partial<ContactTexts>;
    appearance?: ContactAppearance;
};
/** Parse only HTTPS markdown links; all other content stays escaped React text. */
export function consentParts(text: string): {
    text: string;
    href?: string;
}[] {
    const parts: {
        text: string;
        href?: string;
    }[] = [];
    let start = 0;
    for (const match of text.matchAll(/\[([^\]\n]+)\]\(([^\s)]+)\)/g)) {
        if (match.index! > start)
            parts.push({ text: text.slice(start, match.index) });
        let href: string | undefined;
        try {
            const url = new URL(match[2]);
            if (url.protocol === 'https:' && !url.username && !url.password)
                href = url.href;
        } catch {}
        parts.push({ text: match[1], href });
        start = match.index! + match[0].length;
    }
    if (start < text.length) parts.push({ text: text.slice(start) });
    return parts;
}
export function ContactForm(props: ContactFormProps) {
    const [internalOpen, setOpen] = useState(false);
    const open = props.open ?? internalOpen;
    const changeOpen = (value: boolean) => {
        setOpen(value);
        props.onOpenChange?.(value);
    };
    const hook = useContactForm(props);
    const id = useId();
    const form = useRef<HTMLFormElement>(null);
    const previousOpen = useRef(open);
    useEffect(() => {
        if (open && !previousOpen.current) hook.reset();
        previousOpen.current = open;
    }, [open]);
    const appearance = resolveContactAppearance(props.appearance);
    const t = resolveContactTexts(
        props.locale ?? hook.config?.locale,
        props.texts,
    );
    function slot(name: ContactSlotName) {
        return {
            'data-bitsnap-contact-slot': name,
            className: appearance.elements[name]?.className,
            style: appearance.elements[name]?.style,
        };
    }
    const boundary = {
        'data-bitsnap-contact': '',
        'data-theme': appearance.theme,
        style: appearance.boundaryStyle,
    };
    const promise = hook.config ? hook.config.texts.promise : t.promise;
    const focusError = () =>
        requestAnimationFrame(() =>
            form.current
                ?.querySelector<HTMLElement>('[aria-invalid=true]')
                ?.focus(),
        );
    if (hook.status === 'unavailable')
        return hook.error?.code === 'origin_not_allowed' ? (
            <section {...boundary}>
                <style>{contactCSS}</style>
                <p {...slot('error')} role="status">
                    {t.origin_not_allowed}
                </p>
            </section>
        ) : null;
    const content = (
        <>
            {hook.status === 'idle' || hook.status === 'loading' ? (
                <p role="status">{t.loading}</p>
            ) : hook.status === 'success' ? (
                <section {...slot('success')} role="status">
                    <h2>{hook.config?.texts.success || t.success}</h2>
                    {promise && <p {...slot('promise')}>{promise}</p>}
                    <button
                        {...slot('button')}
                        type="button"
                        onClick={() =>
                            props.mode && props.mode !== 'inline'
                                ? changeOpen(false)
                                : hook.reset()
                        }
                    >
                        {props.mode && props.mode !== 'inline'
                            ? t.close
                            : t.another}
                    </button>
                </section>
            ) : (
                <form
                    ref={form}
                    noValidate
                    onSubmit={async (event) => {
                        event.preventDefault();
                        await hook.submit();
                        focusError();
                    }}
                    aria-busy={hook.status === 'submitting'}
                >
                    {promise && <p {...slot('promise')}>{promise}</p>}
                    {props.product && hook.config?.askAboutProduct && (
                        <span {...slot('product')}>
                            {t.product}:{' '}
                            {props.product.name ?? props.product.id}
                        </span>
                    )}
                    {hook.config?.fields.map((field) => {
                        const error = hook.errors[field.key];
                        const fieldId = `${id}-${field.key}`;
                        const common = {
                            id: fieldId,
                            name: field.key,
                            required: field.required,
                            value: hook.values[field.key] ?? '',
                            maxLength: field.maxLength,
                            disabled: hook.status === 'submitting',
                            'aria-invalid': !!error,
                            'aria-describedby': error
                                ? `${fieldId}-error`
                                : undefined,
                            onChange: (
                                event: React.ChangeEvent<
                                    | HTMLInputElement
                                    | HTMLTextAreaElement
                                    | HTMLSelectElement
                                >,
                            ) => hook.setValue(field.key, event.target.value),
                        };
                        return (
                            <div key={field.key} {...slot('field')}>
                                <label {...slot('label')} htmlFor={fieldId}>
                                    {t[field.key]}
                                    {!field.required && (
                                        <span
                                            style={{
                                                fontWeight: 400,
                                                color: 'var(--bc-mutedForeground)',
                                            }}
                                        >
                                            {' '}
                                            ({t.optional})
                                        </span>
                                    )}
                                </label>
                                {field.type === 'textarea' ? (
                                    <textarea
                                        {...common}
                                        {...slot('textarea')}
                                        placeholder={t.messagePlaceholder}
                                    />
                                ) : field.type === 'select' ? (
                                    <select {...common} {...slot('select')}>
                                        <option value="">
                                            {t.topicPlaceholder}
                                        </option>
                                        {field.options?.map((option) => (
                                            <option key={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        {...common}
                                        {...slot('input')}
                                        type={field.type}
                                        autoComplete={
                                            field.key === 'name'
                                                ? 'name'
                                                : field.key === 'email'
                                                  ? 'email'
                                                  : field.key === 'phone'
                                                    ? 'tel'
                                                    : 'off'
                                        }
                                        placeholder={
                                            t[`${field.key}Placeholder`]
                                        }
                                    />
                                )}
                                {field.key === 'message' && (
                                    <small
                                        style={{
                                            color: 'var(--bc-mutedForeground)',
                                        }}
                                    >
                                        {(hook.values.message ?? '').length} /{' '}
                                        {field.maxLength ?? 5000}{' '}
                                        {t.characterCount}
                                    </small>
                                )}
                                {error && (
                                    <p
                                        {...slot('error')}
                                        id={`${fieldId}-error`}
                                    >
                                        {t[error]}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                    {hook.config?.consent && (
                        <div>
                            <label {...slot('consent')}>
                                <input
                                    type="checkbox"
                                    checked={!!hook.values.consent}
                                    disabled={hook.status === 'submitting'}
                                    required={hook.config.consent.required}
                                    aria-invalid={!!hook.errors.consent}
                                    aria-describedby={
                                        hook.errors.consent
                                            ? `${id}-consent-error`
                                            : undefined
                                    }
                                    onChange={(e) =>
                                        hook.setValue(
                                            'consent',
                                            e.target.checked,
                                        )
                                    }
                                />
                                <span>
                                    {consentParts(hook.config.consent.text).map(
                                        (part, index) =>
                                            part.href ? (
                                                <a
                                                    key={index}
                                                    href={part.href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    {part.text}
                                                </a>
                                            ) : (
                                                <React.Fragment key={index}>
                                                    {part.text}
                                                </React.Fragment>
                                            ),
                                    )}
                                </span>
                            </label>
                            {hook.errors.consent && (
                                <p
                                    {...slot('error')}
                                    id={`${id}-consent-error`}
                                >
                                    {hook.errors.consent === 'required'
                                        ? t.consentRequired
                                        : t[hook.errors.consent]}
                                </p>
                            )}
                        </div>
                    )}
                    <div hidden aria-hidden="true">
                        <label>
                            {t.honeypot}
                            <input
                                name="website"
                                tabIndex={-1}
                                autoComplete="off"
                                value={hook.values.website ?? ''}
                                onChange={(e) =>
                                    hook.setValue('website', e.target.value)
                                }
                            />
                        </label>
                    </div>
                    {hook.config?.captcha.required && (
                        <TurnstileChallenge
                            key={
                                hook.error?.code.startsWith('captcha_')
                                    ? hook.error.code
                                    : 'contact'
                            }
                            action="contact_submit"
                            formContext={contactFormContext(hook.config.formId)}
                            attempt={hook.attemptId}
                            host={props.host}
                            locale={props.locale ?? hook.config.locale}
                            onToken={(token) =>
                                hook.setValue('captchaToken', token)
                            }
                            onFailure={() => hook.setValue('captchaToken', '')}
                        />
                    )}
                    {hook.errors.captchaToken && (
                        <p {...slot('error')} role="alert">
                            {t.captcha}
                        </p>
                    )}
                    {hook.error && (
                        <p {...slot('error')} role="alert">
                            {hook.error.code === 'rate_limited'
                                ? t.rate_limited
                                : hook.error.code === 'origin_not_allowed'
                                  ? t.origin_not_allowed
                                  : hook.error.code.startsWith('captcha_')
                                    ? t.captcha
                                    : t.error}
                        </p>
                    )}
                    <button
                        {...slot('button')}
                        type="submit"
                        disabled={hook.status === 'submitting'}
                    >
                        {hook.status === 'submitting' ? t.submitting : t.submit}
                    </button>
                </form>
            )}
        </>
    );
    if (!props.mode || props.mode === 'inline')
        return (
            <section
                {...boundary}
                {...slot('root')}
                style={{
                    ...appearance.boundaryStyle,
                    ...appearance.elements.root?.style,
                }}
            >
                <style>{contactCSS}</style>
                {t.title && <h2>{t.title}</h2>}
                {content}
            </section>
        );
    return (
        <div
            {...boundary}
            {...slot('root')}
            style={{
                ...appearance.boundaryStyle,
                ...appearance.elements.root?.style,
            }}
        >
            <style>{contactCSS}</style>
            <Dialog open={open} onOpenChange={changeOpen}>
                <DialogTrigger asChild>
                    {props.trigger ?? (
                        <button
                            {...slot('launcher')}
                            type="button"
                            style={{
                                ...(props.mode === 'floating'
                                    ? ({
                                          position: 'fixed',
                                          bottom: 24,
                                          [props.launcher?.position ===
                                          'bottom-left'
                                              ? 'left'
                                              : 'right']: 24,
                                          zIndex: 40,
                                      } as React.CSSProperties)
                                    : {}),
                                ...appearance.elements.launcher?.style,
                            }}
                        >
                            {props.launcher?.label ?? t.launcher}
                        </button>
                    )}
                </DialogTrigger>
                <DialogContent
                    {...boundary}
                    {...slot('dialog')}
                    style={{
                        ...appearance.boundaryStyle,
                        ...appearance.elements.dialog?.style,
                    }}
                    showCloseButton={false}
                    aria-describedby={undefined}
                >
                    <DialogTitle>{t.title}</DialogTitle>
                    {content}
                    {hook.status !== 'success' && (
                        <DialogClose asChild>
                            <button
                                type="button"
                                style={{
                                    background: 'transparent',
                                    color: 'var(--bc-mutedForeground)',
                                }}
                            >
                                {t.close}
                            </button>
                        </DialogClose>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
