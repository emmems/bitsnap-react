export type ContactFieldKey =
    'name' | 'email' | 'topic' | 'phone' | 'orderNumber' | 'message';
export type ContactField = {
    key: ContactFieldKey;
    type: 'text' | 'email' | 'select' | 'tel' | 'textarea';
    required: boolean;
    maxLength?: number;
    options?: string[];
};
export type ContactConfig = {
    formId: string;
    enabled: boolean;
    locale: string;
    fields: ContactField[];
    consent: {
        text: string;
        required: boolean;
    } | null;
    texts: {
        promise: string | null;
        success: string;
    };
    captcha: {
        required: boolean;
        action: 'contact_submit';
    };
    askAboutProduct: boolean;
};
export type ContactFieldError =
    | 'required'
    | 'too_long'
    | 'invalid_email'
    | 'invalid_option'
    | 'not_enabled'
    | 'not_found';
export type ContactErrors = Partial<
    Record<
        ContactFieldKey | 'consent' | 'productId' | 'captchaToken',
        ContactFieldError
    >
>;
export type ContactErrorCode =
    | 'invalid'
    | 'origin_not_allowed'
    | 'project_not_found'
    | 'contact_form_unavailable'
    | 'captcha_required'
    | 'captcha_failed'
    | 'rate_limited'
    | 'captcha_unavailable'
    | 'network'
    | 'unexpected'
    | 'unavailable';
export type ContactFailure = {
    code: ContactErrorCode;
    status?: number;
    fields?: ContactErrors;
    retryAfter?: number;
};
export type ContactInquiry = {
    inquiryId: string;
    status: 'received';
};
export type ContactValues = Partial<Record<ContactFieldKey, string>> & {
    consent?: boolean;
    captchaToken?: string;
    website?: string;
};
export type SubmitInquiryInput = ContactValues & {
    idempotencyKey: string;
    productId?: string;
    pageUrl?: string;
    utm?: Record<string, string>;
};
export type ContactClientOptions = {
    projectID: string;
    host?: string;
    fetch?: (input: string, init?: RequestInit) => Promise<Response>;
    signal?: AbortSignal;
};
export type ContactResult<T> =
    | {
          ok: true;
          data: T;
      }
    | {
          ok: false;
          error: ContactFailure;
      };
const fieldKeys: ContactFieldKey[] = [
    'name',
    'email',
    'topic',
    'phone',
    'orderNumber',
    'message',
];
function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}
function isConfig(data: unknown): data is ContactConfig {
    if (
        !isRecord(data) ||
        typeof data.formId !== 'string' ||
        typeof data.enabled !== 'boolean' ||
        typeof data.locale !== 'string' ||
        !Array.isArray(data.fields)
    )
        return false;
    const fieldsValid = data.fields.every((field: unknown) => {
        if (!isRecord(field)) return false;
        return (
            fieldKeys.includes(field.key as ContactFieldKey) &&
            ['text', 'email', 'select', 'tel', 'textarea'].includes(
                field.type as string,
            ) &&
            typeof field.required === 'boolean' &&
            (field.maxLength == null ||
                (typeof field.maxLength === 'number' &&
                    Number.isInteger(field.maxLength) &&
                    field.maxLength > 0)) &&
            (field.type !== 'select' ||
                (Array.isArray(field.options) &&
                    field.options.every((value) => typeof value === 'string')))
        );
    });
    return (
        fieldsValid &&
        (data.consent === null ||
            (isRecord(data.consent) &&
                typeof data.consent.text === 'string' &&
                typeof data.consent.required === 'boolean')) &&
        isRecord(data.texts) &&
        typeof data.texts.success === 'string' &&
        (data.texts.promise === null ||
            typeof data.texts.promise === 'string') &&
        isRecord(data.captcha) &&
        typeof data.captcha.required === 'boolean' &&
        data.captcha.action === 'contact_submit' &&
        typeof data.askAboutProduct === 'boolean'
    );
}
const codes: ContactErrorCode[] = [
    'invalid',
    'origin_not_allowed',
    'project_not_found',
    'contact_form_unavailable',
    'captcha_required',
    'captcha_failed',
    'rate_limited',
    'captcha_unavailable',
];
async function request<T>(
    options: ContactClientOptions,
    path: string,
    body?: SubmitInquiryInput,
): Promise<ContactResult<T>> {
    try {
        const response = await (options.fetch ?? globalThis.fetch)(
            `${(options.host ?? 'https://bitsnap.pl').replace(/\/+$/, '')}/api/contact/v1/${encodeURIComponent(options.projectID)}/${path}`,
            {
                method: body ? 'POST' : 'GET',
                credentials: 'omit',
                signal: options.signal,
                ...(body
                    ? {
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(body),
                      }
                    : {}),
            },
        );
        const data = await response.json().catch(() => null);
        if (response.ok) {
            const valid =
                path === 'form'
                    ? isConfig(data)
                    : data &&
                      typeof data.inquiryId === 'string' &&
                      data.status === 'received';
            return valid
                ? { ok: true, data }
                : {
                      ok: false,
                      error: { code: 'unexpected', status: response.status },
                  };
        }
        const code = codes.includes(data?.error)
            ? (data.error as ContactErrorCode)
            : 'unexpected';
        if (code === 'origin_not_allowed')
            console.warn(
                '[Bitsnap Contact] Add this website domain to Bitsnap settings → allowed domains to enable the contact form.',
            );
        const retry = Number(
            data?.retryAfter ?? response.headers.get('Retry-After'),
        );
        return {
            ok: false,
            error: {
                code,
                status: response.status,
                ...(code === 'invalid' && data?.fields
                    ? { fields: data.fields }
                    : {}),
                ...(code === 'rate_limited' &&
                Number.isFinite(retry) &&
                retry > 0
                    ? { retryAfter: retry }
                    : {}),
            },
        };
    } catch {
        return { ok: false, error: { code: 'network' } };
    }
}
export const getContactForm = (options: ContactClientOptions) =>
    request<ContactConfig>(options, 'form');
export const submitInquiry = (
    options: ContactClientOptions,
    input: SubmitInquiryInput,
) => request<ContactInquiry>(options, 'inquiries', input);
