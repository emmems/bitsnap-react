import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import {
    getContactForm,
    submitInquiry,
    type ContactConfig,
    type ContactClientOptions,
} from './client';
import {
    narrowContactConfig,
    validateContact,
    useContactForm,
    contactAttemptId,
    contactFormContext,
} from './useContactForm';
import { consentParts, ContactForm } from './ContactForm';
const config: ContactConfig = {
    formId: 'frm_test',
    enabled: true,
    locale: 'en',
    fields: [
        { key: 'name', type: 'text', required: true, maxLength: 120 },
        { key: 'email', type: 'email', required: true, maxLength: 254 },
        { key: 'topic', type: 'select', required: false, options: ['A', 'B'] },
        { key: 'message', type: 'textarea', required: true, maxLength: 5000 },
    ],
    consent: { text: 'Agree', required: true },
    texts: { success: 'Thanks', promise: null },
    captcha: { required: false, action: 'contact_submit' },
    askAboutProduct: true,
};
test('contract failures map without throwing, including origin and captcha', async () => {
    for (const [status, code] of [
        [400, 'invalid'],
        [403, 'origin_not_allowed'],
        [404, 'project_not_found'],
        [422, 'captcha_required'],
        [422, 'captcha_failed'],
        [429, 'rate_limited'],
        [503, 'captcha_unavailable'],
    ] as const) {
        const result = await submitInquiry(
            {
                projectID: 'p',
                fetch: async () =>
                    new Response(
                        JSON.stringify({
                            error: code,
                            fields: { email: 'invalid_email' },
                            retryAfter: 30,
                        }),
                        { status },
                    ),
            },
            { idempotencyKey: 'key-12345' },
        );
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.error.code, code);
            if (status === 429) assert.equal(result.error.retryAfter, 30);
            if (status === 400)
                assert.equal(result.error.fields?.email, 'invalid_email');
        }
    }
    assert.deepEqual(
        await getContactForm({
            projectID: 'p',
            fetch: async () => {
                throw Error('offline');
            },
        }),
        { ok: false, error: { code: 'network' } },
    );
    assert.equal(
        (
            await getContactForm({
                projectID: 'p',
                fetch: async () => new Response('<html/>'),
            })
        ).ok,
        false,
    );
});
test('required fields cannot be hidden and topics can only narrow seller options', () => {
    const narrowed = narrowContactConfig(
        config,
        { email: false, name: false, topic: false, phone: true },
        ['B', 'unknown'],
    );
    assert.deepEqual(
        narrowed.fields.map((f) => f.key),
        ['name', 'email', 'message'],
    );
    assert.deepEqual(
        narrowContactConfig(config, {}, ['B', 'A', 'B', 'unknown']).fields[2]
            .options,
        ['B', 'A'],
    );
});
test('validation mirrors enabled fields, lengths, topics and consent', () => {
    assert.deepEqual(
        validateContact(config, {
            name: 'A',
            email: 'invalid',
            message: 'x'.repeat(5001),
            topic: 'X',
        }),
        {
            email: 'invalid_email',
            message: 'too_long',
            topic: 'invalid_option',
            consent: 'required',
        },
    );
    assert.deepEqual(
        validateContact(config, {
            name: ' A ',
            email: 'a@b.com',
            message: 'Hello',
            consent: true,
        }),
        {},
    );
});
test('consent accepts only HTTPS links and leaves HTML as text', () => {
    assert.deepEqual(
        consentParts(
            '<img src=x> [safe](https://example.com) [bad](javascript:alert) [http](http://example.com)',
        ),
        [
            { text: '<img src=x> ' },
            { text: 'safe', href: 'https://example.com/' },
            { text: ' ' },
            { text: 'bad', href: undefined },
            { text: ' ' },
            { text: 'http', href: undefined },
        ],
    );
});
test('hook preserves values and idempotency on retry and maps server errors', async () => {
    const dom = new JSDOM('<div id="root"></div>', {
        url: 'https://merchant.example',
    });
    const oldWindow = globalThis.window;
    const oldDocument = globalThis.document;
    Object.assign(globalThis, {
        window: dom.window,
        document: dom.window.document,
        IS_REACT_ACT_ENVIRONMENT: true,
    });
    const bodies: Record<string, unknown>[] = [];
    let attempt = 0;
    const fetchImpl: ContactClientOptions['fetch'] = async (_url, init) => {
        if (init?.method === 'GET') return Response.json(config);
        bodies.push(JSON.parse(init!.body as string));
        attempt++;
        return attempt === 1
            ? Response.json(
                  { error: 'invalid', fields: { email: 'invalid_email' } },
                  { status: 400 },
              )
            : Response.json(
                  { inquiryId: 'inq_1', status: 'received' },
                  { status: 201 },
              );
    };
    let hook!: ReturnType<typeof useContactForm>;
    function Probe() {
        hook = useContactForm({
            projectID: 'p',
            fetch: fetchImpl,
            prefill: { name: 'Anna', email: 'a@b.com' },
        });
        return null;
    }
    const root = createRoot(document.getElementById('root')!);
    try {
        await act(async () => {
            root.render(<Probe />);
        });
        await act(async () => {
            hook.setValue('message', 'Hello');
            hook.setValue('consent', true);
        });
        await act(async () => {
            await hook.submit();
        });
        assert.equal(hook.status, 'error');
        assert.equal(hook.errors.email, 'invalid_email');
        assert.equal(hook.values.message, 'Hello');
        await act(async () => {
            await hook.submit();
        });
        assert.equal(hook.status, 'success');
        assert.equal(bodies[0].idempotencyKey, bodies[1].idempotencyKey);
        await act(async () => {
            hook.reset();
        });
        await act(async () => {
            hook.setValue('message', 'Again');
            hook.setValue('consent', true);
        });
        await act(async () => {
            await hook.submit();
        });
        assert.notEqual(bodies[1].idempotencyKey, bodies[2].idempotencyKey);
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        Object.assign(globalThis, { window: oldWindow, document: oldDocument });
    }
});

test('attempt id and form context follow the challenge page contract', () => {
    assert.equal(contactFormContext('frm_abc123'), 'form_abc123');
    assert.equal(contactFormContext('abc123'), 'form_abc123');
    const id = contactAttemptId(
        '123e4567-e89b-12d3-a456-426614174000-' + 'x'.repeat(80),
    );
    assert.match(id, /^[A-Za-z0-9_-]{1,64}$/);
    assert.equal(contactAttemptId('!!!'), 'contact');
});

test('ContactForm gives the Turnstile challenge formContext and a per-open-form attempt, renewed after reset', async () => {
    const dom = new JSDOM('<div id="root"></div>', {
        url: 'https://merchant.example',
    });
    const oldWindow = globalThis.window;
    const oldDocument = globalThis.document;
    Object.assign(globalThis, {
        window: dom.window,
        document: dom.window.document,
        IS_REACT_ACT_ENVIRONMENT: true,
    });
    const captchaConfig: ContactConfig = {
        ...config,
        captcha: { required: true, action: 'contact_submit' },
    };
    const fetchImpl: ContactClientOptions['fetch'] = async (_url, init) =>
        init?.method === 'GET'
            ? Response.json(captchaConfig)
            : Response.json(
                  { inquiryId: 'inq_1', status: 'received' },
                  { status: 201 },
              );
    const root = createRoot(document.getElementById('root')!);
    const challenge = () =>
        new URL(document.querySelector('iframe')!.getAttribute('src')!);
    try {
        await act(async () => {
            root.render(
                <ContactForm
                    projectID="p"
                    fetch={fetchImpl}
                    prefill={{ name: 'Anna', email: 'a@b.com' }}
                />,
            );
        });
        const first = challenge();
        assert.equal(first.pathname, '/challenge');
        assert.equal(first.searchParams.get('action'), 'contact_submit');
        assert.equal(first.searchParams.get('formContext'), 'form_test');
        assert.match(
            first.searchParams.get('attempt') ?? '',
            /^[A-Za-z0-9_-]{1,64}$/,
        );
        await act(async () => {
            root.render(
                <ContactForm
                    projectID="p"
                    fetch={fetchImpl}
                    prefill={{ name: 'Anna', email: 'a@b.com' }}
                />,
            );
        });
        assert.equal(
            challenge().searchParams.get('attempt'),
            first.searchParams.get('attempt'),
        );
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        Object.assign(globalThis, { window: oldWindow, document: oldDocument });
    }
});

test('inline hosts can omit the heading and product context stays labelled and themeable', async () => {
    const dom = new JSDOM('<div id="root"></div>', {
        url: 'https://merchant.example',
    });
    const oldWindow = globalThis.window;
    const oldDocument = globalThis.document;
    Object.assign(globalThis, {
        window: dom.window,
        document: dom.window.document,
        IS_REACT_ACT_ENVIRONMENT: true,
    });
    const root = createRoot(document.getElementById('root')!);
    try {
        for (const [locale, label] of [
            ['en', 'Asking about: Book'],
            ['pl', 'Pytanie o produkt: Book'],
        ]) {
            await act(async () => {
                root.render(
                    <ContactForm
                        projectID="p"
                        locale={locale}
                        texts={{ title: '' }}
                        product={{ id: 'book', name: 'Book' }}
                        fetch={async () => Response.json(config)}
                        appearance={{
                            elements: {
                                product: { className: 'product-context' },
                            },
                        }}
                    />,
                );
            });
            assert.equal(document.querySelector('h2'), null);
            const product = document.querySelector(
                '[data-bitsnap-contact-slot="product"]',
            );
            assert.equal(product?.textContent, label);
            assert.equal(product?.className, 'product-context');
        }
        await act(async () => {
            root.render(
                <ContactForm
                    projectID="p"
                    locale="en"
                    fetch={async () => Response.json(config)}
                />,
            );
        });
        assert.equal(document.querySelector('h2')?.textContent, 'Contact us');
        assert.equal(
            document.querySelector('[data-bitsnap-contact-slot="product"]'),
            null,
        );
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        Object.assign(globalThis, { window: oldWindow, document: oldDocument });
    }
});
