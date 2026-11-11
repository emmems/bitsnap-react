import { useEffect, useRef, useState } from 'react';
import {
    getContactForm,
    submitInquiry,
    type ContactClientOptions,
    type ContactConfig,
    type ContactErrors,
    type ContactFailure,
    type ContactFieldKey,
    type ContactInquiry,
    type ContactValues,
} from './client';
export type ContactStatus =
    | 'idle'
    | 'loading'
    | 'ready'
    | 'submitting'
    | 'success'
    | 'error'
    | 'unavailable';
export type UseContactFormOptions = ContactClientOptions & {
    prefill?: Pick<ContactValues, 'name' | 'email' | 'orderNumber' | 'topic'>;
    fields?: Partial<Record<ContactFieldKey, boolean>>;
    topics?: string[];
    product?: {
        id: string;
        name?: string;
    };
    onSubmitted?: (inquiry: ContactInquiry) => void;
    onError?: (error: ContactFailure) => void;
};
export function narrowContactConfig(
    config: ContactConfig,
    fields?: UseContactFormOptions['fields'],
    topics?: string[],
): ContactConfig {
    return {
        ...config,
        fields: config.fields
            .filter((f) => f.required || fields?.[f.key] !== false)
            .map((f) =>
                f.key === 'topic' && topics
                    ? {
                          ...f,
                          options: [...new Set(topics)].filter((t) =>
                              f.options?.includes(t),
                          ),
                      }
                    : f,
            ),
    };
}
export function validateContact(
    config: ContactConfig,
    values: ContactValues,
): ContactErrors {
    const errors: ContactErrors = {};
    for (const field of config.fields) {
        const value = (values[field.key] ?? '').trim();
        if (!value && field.required) errors[field.key] = 'required';
        else if (field.maxLength && value.length > field.maxLength)
            errors[field.key] = 'too_long';
        else if (
            value &&
            field.key === 'email' &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        )
            errors.email = 'invalid_email';
        else if (
            value &&
            field.key === 'topic' &&
            !field.options?.includes(value)
        )
            errors.topic = 'invalid_option';
    }
    if (config.consent?.required && !values.consent)
        errors.consent = 'required';
    if (config.captcha.required && !values.captchaToken)
        errors.captchaToken = 'required';
    return errors;
}
function newKey() {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `contact-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
}
/** Challenge-page `attempt` value: the idempotency key limited to `[A-Za-z0-9_-]{1,64}`. */
export function contactAttemptId(key: string): string {
    return key.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'contact';
}
/** Challenge-page `formContext` value for a form id: `frm_<publicId>` becomes `form_<publicId>`. */
export function contactFormContext(formId: string): string {
    return `form_${formId.replace(/^frm_/, '')}`;
}
export function useContactForm(options: UseContactFormOptions) {
    const [rawConfig, setConfig] = useState<ContactConfig | null>(null);
    const [values, setValues] = useState<ContactValues>(() => ({
        ...options.prefill,
    }));
    const [errors, setErrors] = useState<ContactErrors>({});
    const [error, setError] = useState<ContactFailure | null>(null);
    const [status, setStatus] = useState<ContactStatus>('idle');
    const key = useRef('');
    const [attemptId, setAttemptId] = useState('');
    const busy = useRef(false);
    const generation = useRef(0);
    const latest = useRef(options);
    latest.current = options;
    const config = rawConfig
        ? narrowContactConfig(rawConfig, options.fields, options.topics)
        : null;
    useEffect(() => {
        const controller = new AbortController();
        const current = ++generation.current;
        key.current = newKey();
        setAttemptId(contactAttemptId(key.current));
        busy.current = false;
        setConfig(null);
        setValues({ ...latest.current.prefill });
        setErrors({});
        setError(null);
        setStatus('loading');
        getContactForm({ ...options, signal: controller.signal }).then(
            (result) => {
                if (controller.signal.aborted || current !== generation.current)
                    return;
                if (result.ok && result.data.enabled) {
                    setConfig(result.data);
                    setStatus('ready');
                } else {
                    const failure: ContactFailure = result.ok
                        ? { code: 'unavailable' }
                        : result.error;
                    setError(failure);
                    setStatus('unavailable');
                    latest.current.onError?.(failure);
                }
            },
        );
        return () => {
            controller.abort();
            generation.current++;
        };
    }, [options.projectID, options.host, options.fetch]);
    function setValue<K extends keyof ContactValues>(
        field: K,
        value: ContactValues[K],
    ) {
        if (busy.current) return;
        setValues((previous) => ({ ...previous, [field]: value }));
        setErrors((previous) => ({ ...previous, [field]: undefined }));
    }
    function reset() {
        if (busy.current) return;
        key.current = newKey();
        setAttemptId(contactAttemptId(key.current));
        setValues({ ...latest.current.prefill });
        setErrors({});
        setError(null);
        setStatus(config ? 'ready' : 'idle');
    }
    async function submit(): Promise<ContactInquiry | undefined> {
        if (!config || busy.current || status === 'success') return;
        const validation = validateContact(config, values);
        setErrors(validation);
        if (Object.keys(validation).length) return;
        busy.current = true;
        setStatus('submitting');
        setError(null);
        const current = generation.current;
        const body = Object.fromEntries(
            config.fields
                .filter((f) => values[f.key]?.trim())
                .map((f) => [f.key, values[f.key]!.trim()]),
        );
        const result = await submitInquiry(options, {
            ...body,
            idempotencyKey: key.current || (key.current = newKey()),
            website: values.website ?? '',
            ...(config.consent ? { consent: !!values.consent } : {}),
            ...(config.captcha.required
                ? { captchaToken: values.captchaToken }
                : {}),
            ...(options.product && config.askAboutProduct
                ? { productId: options.product.id }
                : {}),
            ...(typeof window !== 'undefined'
                ? { pageUrl: window.location.href }
                : {}),
        });
        if (current !== generation.current) return;
        busy.current = false;
        if (result.ok) {
            setStatus('success');
            latest.current.onSubmitted?.(result.data);
            return result.data;
        }
        setErrors(result.error.fields ?? {});
        setError(result.error);
        setStatus('error');
        latest.current.onError?.(result.error);
        return undefined;
    }
    return {
        config,
        values,
        errors,
        error,
        status,
        attemptId,
        setValue,
        submit,
        reset,
    };
}
export type UseContactFormResult = ReturnType<typeof useContactForm>;
