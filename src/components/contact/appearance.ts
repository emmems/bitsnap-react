import {
    resolveAppearanceCore,
    type AppearanceElements,
    type SlotAppearance,
} from '../../lib/appearance-core';
export const CONTACT_SLOT_NAMES = [
    'product',
    'root',
    'field',
    'label',
    'input',
    'textarea',
    'select',
    'consent',
    'button',
    'promise',
    'success',
    'error',
    'launcher',
    'dialog',
] as const;
export type ContactSlotName = (typeof CONTACT_SLOT_NAMES)[number];
export type ContactTheme = 'light' | 'dark' | 'auto';
export type ContactAppearanceTokens = {
    background: string;
    foreground: string;
    mutedForeground: string;
    border: string;
    accent: string;
    accentForeground: string;
    error: string;
    radius: string;
};
export type ContactAppearance = {
    theme?: ContactTheme;
    tokens?: Partial<ContactAppearanceTokens>;
    elements?: AppearanceElements<ContactSlotName>;
};
export type ContactSlotAppearance = SlotAppearance;
export type ContactAppearanceElements = AppearanceElements<ContactSlotName>;
const light = {
    background: '#ffffff',
    foreground: '#18181b',
    mutedForeground: '#52525b',
    border: '#a1a1aa',
    accent: '#18181b',
    accentForeground: '#ffffff',
    error: '#b91c1c',
    radius: '8px',
};
const dark = {
    ...light,
    background: '#18181b',
    foreground: '#fafafa',
    mutedForeground: '#a1a1aa',
    border: '#71717a',
    accent: '#fafafa',
    accentForeground: '#18181b',
    error: '#fca5a5',
};
export function resolveContactAppearance(appearance?: ContactAppearance) {
    return resolveAppearanceCore(appearance, {
        defaultTheme: 'auto' as ContactTheme,
        presets: { light, dark, auto: {} },
        variables: Object.fromEntries(
            Object.keys(light).map((key) => [key, `--bc-${key}`]),
        ) as Record<keyof ContactAppearanceTokens, string>,
        shadcnVariables: [],
    });
}
export const contactCSS = `
[data-bitsnap-contact]{--bc-background:#fff;--bc-foreground:#18181b;--bc-mutedForeground:#52525b;--bc-border:#a1a1aa;--bc-accent:#18181b;--bc-accentForeground:#fff;--bc-error:#b91c1c;--bc-radius:8px;font-family:inherit;color:var(--bc-foreground);color-scheme:light}
@media(prefers-color-scheme:dark){[data-bitsnap-contact][data-theme=auto]{--bc-background:#18181b;--bc-foreground:#fafafa;--bc-mutedForeground:#a1a1aa;--bc-border:#71717a;--bc-accent:#fafafa;--bc-accentForeground:#18181b;--bc-error:#fca5a5;color-scheme:dark}}
[data-bitsnap-contact][data-theme=dark]{color-scheme:dark}
[data-bitsnap-contact] *{box-sizing:border-box;font-family:inherit}
[data-bitsnap-contact] form,[data-bitsnap-contact-slot=success]{display:grid;gap:20px}
[data-bitsnap-contact-slot=product]{justify-self:start;max-width:100%;padding:6px 10px;border:1px solid var(--bc-border);border-radius:var(--bc-radius);background:var(--bc-background);color:var(--bc-foreground);font-size:14px;line-height:1.5;overflow-wrap:anywhere}
[data-bitsnap-contact-slot=field]{display:grid;gap:8px}
[data-bitsnap-contact-slot=label]{font-size:14px;font-weight:500}
[data-bitsnap-contact] input:not([type=checkbox]),[data-bitsnap-contact] textarea,[data-bitsnap-contact] select{width:100%;min-height:44px;padding:11px 12px;font:inherit;font-size:16px;line-height:1.5;border:1px solid var(--bc-border);border-radius:var(--bc-radius);background:var(--bc-background);color:var(--bc-foreground)}
[data-bitsnap-contact] textarea{min-height:144px;resize:vertical}
[data-bitsnap-contact] ::placeholder{color:var(--bc-mutedForeground);opacity:1}
[data-bitsnap-contact] :focus-visible{outline:2px solid var(--bc-accent);outline-offset:3px}
[data-bitsnap-contact] [aria-invalid=true]{border-color:var(--bc-error)}
[data-bitsnap-contact] button{min-height:44px;padding:12px 18px;border:0;border-radius:var(--bc-radius);font-size:16px;font-weight:500;cursor:pointer;background:var(--bc-accent);color:var(--bc-accentForeground)}
[data-bitsnap-contact] button:hover{filter:brightness(.9)}
[data-bitsnap-contact] button:disabled{opacity:.55;cursor:wait}
[data-bitsnap-contact-slot=promise]{font-size:14px;line-height:1.6;color:var(--bc-mutedForeground);margin:0}
[data-bitsnap-contact-slot=error]{color:var(--bc-error);font-size:14px;line-height:1.5;margin:0}
[data-bitsnap-contact-slot=consent]{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.6;min-height:44px}
[data-bitsnap-contact-slot=consent] input{margin-top:5px;min-width:20px;min-height:20px;accent-color:var(--bc-accent)}
[data-bitsnap-contact] a{color:inherit;text-decoration:underline;text-underline-offset:3px}
[data-bitsnap-contact] h2{font-size:24px;line-height:1.3;margin:0 0 20px;font-weight:600}
[data-bitsnap-contact-slot=dialog]{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:51;display:grid;gap:16px;width:calc(100% - 32px);max-width:520px;padding:24px;border-radius:var(--bc-radius);border:0;animation:none!important;background:var(--bc-background);color:var(--bc-foreground);max-height:90dvh;overflow-y:auto;font-family:inherit}
[data-slot=dialog-overlay]:has(+ [data-bitsnap-contact-slot=dialog]){position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.5);animation:none!important}
@media(prefers-reduced-motion:reduce){[data-bitsnap-contact]{animation:none!important;transition:none!important}}
`;
