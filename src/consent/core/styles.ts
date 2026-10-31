/** Colors of both themes. Every text/background pair is checked against WCAG AA in the tests. */
export const PALETTE = {
  light: {
    bg: "#ffffff",
    fg: "#14171c",
    muted: "#495260",
    border: "#c9ced6",
    off: "#6b7280",
    thumb: "#ffffff",
    accent: "#1d4ed8",
    onAccent: "#ffffff",
    link: "#1d4ed8",
  },
  dark: {
    bg: "#171a20",
    fg: "#f1f3f6",
    muted: "#b7beca",
    border: "#3a404b",
    off: "#8b93a1",
    thumb: "#171a20",
    accent: "#8ab4ff",
    onAccent: "#0b1220",
    link: "#9dc0ff",
  },
} as const;

const vars = (p: (typeof PALETTE)["light"]) =>
  `--bg:${p.bg};--fg:${p.fg};--muted:${p.muted};--border:${p.border};--off:${p.off};--thumb:${p.thumb};--accent:${p.accent};--on-accent:${p.onAccent};--link:${p.link};--focus:${p.accent}`;

export const STYLES = `
:host{all:initial}
*{box-sizing:border-box}
[hidden]{display:none!important}
.root{${vars(PALETTE.light)};position:fixed;inset:0;pointer-events:none;z-index:2147483000;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--fg);-webkit-text-size-adjust:100%}
.root[data-theme=dark]{${vars(PALETTE.dark)};color-scheme:dark}
button,input{font:inherit;color:inherit}
.banner,.overlay{pointer-events:auto}
@supports (color:color-mix(in srgb,red 50%,blue)){::selection{background:color-mix(in srgb,var(--accent) 24%,transparent)}}
.banner{position:absolute;background:var(--bg);color:var(--fg);max-height:92vh;overflow:auto;outline:none}
.banner.enter{animation:in .22s ease-out}
.banner.closing{animation:out .2s ease-in forwards;pointer-events:none}
.bottom{left:0;right:0;bottom:0;border-top:1px solid var(--border);box-shadow:0 -8px 28px rgba(15,23,42,.08);padding:20px 24px calc(20px + env(safe-area-inset-bottom,0px))}
.root[data-theme=dark] .bottom{box-shadow:0 -8px 28px rgba(0,0,0,.4)}
.bottom .inner{display:grid;grid-template-columns:minmax(min(100%,42ch),1fr) auto;grid-template-areas:"text actions" "foot actions";gap:4px 40px;align-items:center;max-width:1120px;margin:0 auto}
.bottom .text{max-width:68ch}
.bottom .btn,.bottom .link-btn{flex:0 0 auto}
.card{bottom:16px;width:min(400px,calc(100vw - 32px));border:1px solid var(--border);border-radius:14px;padding:20px;box-shadow:0 12px 32px rgba(15,23,42,.14)}
.root[data-theme=dark] .card{box-shadow:0 12px 32px rgba(0,0,0,.45)}
.bottom-left{left:16px}
.bottom-right{right:16px}
.card .inner{display:flex;flex-direction:column;gap:16px}
.text{grid-area:text}
.actions{grid-area:actions;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}
.card .actions{justify-content:stretch}
.foot{grid-area:foot}
.title{overflow-wrap:anywhere;font-size:17px;font-weight:650;line-height:1.35;letter-spacing:-.01em;text-wrap:balance;margin:0 0 6px}
.desc{overflow-wrap:anywhere;margin:0;color:var(--muted);line-height:1.55;text-wrap:pretty}
.desc a{color:var(--link);text-decoration:underline;text-underline-offset:3px}
.btn,.link-btn{min-height:38px;padding:0 16px;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .12s ease-out,filter .12s ease-out,border-color .12s ease-out}
.btn{border:2px solid var(--accent);background:var(--accent);color:var(--on-accent);flex:1 1 150px}
.btn:hover{filter:brightness(.93)}
.btn:active{filter:brightness(.87)}
.link-btn{border:1px solid var(--off);background:transparent;color:var(--fg);text-decoration:none}
.link-btn:hover{border-color:var(--fg)}
@supports (color:color-mix(in srgb,red 50%,blue)){.link-btn:hover{background:color-mix(in srgb,var(--fg) 9%,transparent)}.link-btn:active{background:color-mix(in srgb,var(--fg) 14%,transparent)}}
.card .link-btn{flex:1 1 100%}
button:focus-visible,a:focus-visible,.dialog:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.foot{font-size:12px;color:var(--muted);padding-top:8px}
.foot a{color:var(--muted);text-decoration:none;display:inline-flex;align-items:center;gap:5px;vertical-align:middle}
.foot a:hover{text-decoration:underline}
.foot b{color:var(--fg);font-weight:700;letter-spacing:-.01em}
.foot svg{display:block}
.overlay{position:absolute;inset:0;background:rgba(10,12,16,.58);display:flex;align-items:center;justify-content:center;padding:16px}
.overlay.enter{animation:fade .2s ease-out}
.overlay.closing{animation:fadeout .2s ease-in forwards;pointer-events:none}
.dialog{background:var(--bg);color:var(--fg);width:100%;max-width:560px;max-height:min(92vh,760px);display:flex;flex-direction:column;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.35);outline:none}
.dialog.enter{animation:in .22s ease-out}
.d-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 8px 8px 24px}
.d-head .title{margin:0;font-size:18px}
.x{width:44px;height:44px;border:0;border-radius:10px;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none}
.x:hover{background:var(--border)}
.d-body{overflow:auto;padding:0 24px 8px;flex:1}
.cat{border-top:1px solid var(--border);padding:10px 0 14px}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.cat-title{font-weight:600;font-size:15px}
.always{font-size:12px;color:var(--muted);margin-right:4px}
.cat p{margin:0;color:var(--muted)}
.cat .svc{margin-top:6px;font-size:13px}
.cat .svc b{font-weight:600;color:var(--fg)}
.switch{position:relative;width:52px;height:44px;display:flex;align-items:center;justify-content:flex-end;flex:none}
.switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.switch input:disabled{cursor:default}
.track{width:44px;height:24px;border-radius:12px;background:var(--off);position:relative;transition:background .15s}
.track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--thumb);transition:transform .15s}
input:checked+.track{background:var(--accent)}
input:checked+.track::after{transform:translateX(20px);background:var(--on-accent)}
input:disabled+.track{opacity:.6}
input:focus-visible+.track{outline:2px solid var(--focus);outline-offset:2px}
.d-foot{display:flex;flex-direction:column;gap:8px;padding:12px 24px 16px;border-top:1px solid var(--border)}
.d-foot .actions{justify-content:stretch}
@keyframes in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(12px)}}
@keyframes fadeout{from{opacity:1}to{opacity:0}}
@media(max-width:960px){
.bottom .inner{grid-template-columns:minmax(0,1fr);grid-template-areas:"text" "actions" "foot";gap:14px}
.bottom .actions{justify-content:flex-start}
}
@media(max-width:640px){
.bottom{padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))}
.bottom .inner{gap:12px}
.bottom .actions{justify-content:stretch}
.bottom .btn{flex:1 1 130px}
.bottom .link-btn{flex:1 1 100%}
.card{left:8px;right:8px;bottom:8px;width:auto}
.overlay{align-items:flex-end;padding:0}
.dialog{max-width:none;border-radius:16px 16px 0 0;max-height:92vh}
.d-head{padding-left:16px}
.d-body{padding:0 16px 8px}
.d-foot{padding:12px 16px calc(16px + env(safe-area-inset-bottom,0px))}
.btn{flex-basis:130px}
.btn,.link-btn{padding:0 12px;min-height:40px}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`.replace(/\n/g, "");
