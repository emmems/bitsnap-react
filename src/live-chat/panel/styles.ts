export const styles = `
:host{all:initial}
[hidden]{display:none!important}
.chat{--bg:#fff;--fg:#19212a;--muted:#515c69;--surface:#f2f4f7;--line:#d6dce2;--field:#7c8593;--warn:#942e24;color-scheme:light;position:fixed;z-index:2147482000;right:var(--right,16px);left:var(--left,auto);bottom:calc(88px + var(--inset,0px) + var(--offset,0px) + env(safe-area-inset-bottom));width:min(380px,calc(100vw - 32px));height:min(600px,calc(100dvh - 108px - var(--inset,0px) - var(--offset,0px)));display:flex;flex-direction:column;overflow:hidden;border-radius:14px;background:var(--bg);color:var(--fg);box-shadow:0 16px 52px #10182038;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:start;-webkit-text-size-adjust:100%;overscroll-behavior:contain}
.chat[data-dark]{--bg:#171a20;--fg:#eef1f5;--muted:#bac2ce;--surface:#252a33;--line:#454c58;--field:#717a8a;--warn:#ffb1a5;color-scheme:dark}
.chat *{box-sizing:border-box}
.chat ::selection{background:var(--accent);color:var(--on-accent)}
.chat p{margin:0}
.chat :where(button,input,textarea){font:inherit;color:inherit}
.chat button{position:static;display:inline-flex;align-items:center;justify-content:center;width:auto;height:auto;background:none;color:inherit;box-shadow:none;border:0;cursor:pointer;border-radius:8px;padding:0 10px;min-height:40px;font-weight:600}
.chat button:hover:not(:disabled),.chat [role=menuitem]:hover{background:var(--surface)}
.chat button:disabled{cursor:default;opacity:.65}
.chat a{color:var(--accent-text);text-underline-offset:3px}
.chat :focus-visible{outline:2px solid var(--accent-text);outline-offset:2px}
.chat header{position:relative;display:flex;align-items:center;gap:8px;padding:10px 10px 10px 16px;border-bottom:1px solid var(--line)}
.chat .avatar{flex:0 0 32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:var(--on-accent);font-weight:700}
.chat h2{font-size:16px;line-height:1.3;letter-spacing:-.015em;margin:0;overflow-wrap:anywhere}
.chat header .title{flex:1;min-width:0}
.chat header small{display:block;color:var(--muted);overflow-wrap:anywhere}
.chat header button.add{min-height:24px;padding:0;color:var(--accent-text);text-decoration:underline;text-underline-offset:3px;font-size:12px}
.chat button.icon{padding:0;flex:0 0 44px;min-width:44px;min-height:44px}
.chat svg{width:20px;height:20px}
.chat [role=menu]{position:absolute;right:12px;top:100%;z-index:1;display:grid;background:var(--bg);box-shadow:0 6px 24px #10182042;border-radius:10px;padding:4px}
.chat [role=menuitem]{display:block;padding:10px;color:var(--fg);border-radius:6px}
.chat .scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-color:var(--line) var(--bg);padding:16px}
.chat button.older{display:block;margin:0 auto 10px;color:var(--accent-text);font-size:12px}
.chat .row{display:flex;flex-direction:column;align-items:flex-start;margin-bottom:14px;gap:3px}
.chat .row.own{align-items:flex-end}
.chat .meta{font-size:12px;color:var(--muted)}
.chat .bubble{max-width:86%;background:var(--surface);border-radius:12px 12px 12px 4px;padding:9px 12px;white-space:pre-wrap;overflow-wrap:anywhere}
.chat .own .bubble{background:var(--accent);color:var(--on-accent);border-radius:12px 12px 4px 12px}
.chat .date{font-size:12px;color:var(--muted);text-align:center;margin:8px 0 12px}
.chat .new-reply{color:var(--accent-text);font-size:12px;border-bottom:1px solid var(--line);margin:10px 0;padding-bottom:4px}
.chat .email-card{border-radius:14px;background:var(--surface);padding:12px;display:grid;gap:8px;margin-top:12px}
.chat .email-card label{font-size:12px;color:var(--muted)}
.chat .email-card input,.chat textarea{width:100%;min-width:0;background:var(--bg);color:var(--fg);border:1px solid var(--field);border-radius:10px;padding:9px 10px;caret-color:var(--accent-text)}
.chat input::placeholder,.chat textarea::placeholder{color:var(--muted)}
.chat button.primary{background:var(--accent);color:var(--on-accent);padding:0 14px}
.chat button.primary:hover:not(:disabled){filter:brightness(.93);background:var(--accent)}
.chat footer{border-top:1px solid var(--line);padding:12px 14px;display:grid;gap:7px}
.chat .legal{font-size:11.5px;color:var(--muted);display:grid;gap:3px}
.chat .composer{display:flex;align-items:flex-end;gap:8px}
.chat textarea{min-height:44px;resize:none;field-sizing:content;max-height:96px;line-height:1.4}
.chat .counter{text-align:right;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.chat .error{color:var(--warn);font-size:12px;overflow-wrap:anywhere}
.chat .notice{font-size:12px;color:var(--muted);overflow-wrap:anywhere}
.chat .captcha{position:relative}
.chat .captcha iframe{position:absolute;width:100%;height:78px;border:0;opacity:0;pointer-events:none}
.chat .captcha button,.chat .captcha p{display:none}
.chat .captcha.interactive iframe{position:static;width:100%;height:78px;border:0;opacity:1;pointer-events:auto}
.chat .captcha.interactive :is(button,p),.chat .captcha.slow button{display:block}
.chat[data-page]{position:relative;inset:auto;margin:24px auto;height:min(760px,calc(100dvh - 48px));width:min(540px,calc(100vw - 32px))}
@media(pointer:coarse){.chat textarea,.chat input{font-size:16px}}
@media(max-width:479px){
  .chat,.chat[data-page]{position:fixed;inset:0;margin:0;width:100%;height:100vh;height:var(--viewport,100dvh);top:var(--viewport-top,0px);border-radius:0}
  .chat header{padding-top:calc(10px + env(safe-area-inset-top))}
  .chat footer{padding-bottom:calc(12px + env(safe-area-inset-bottom) + var(--inset,0px))}
  .chat button{min-height:44px}
}
`;
