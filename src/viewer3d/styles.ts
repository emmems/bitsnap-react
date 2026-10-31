/**
 * Styles of the 3D viewer, rendered as one React 19 `<style href precedence>`
 * element: hoisted to `<head>`, deduplicated, and part of the server render,
 * so the poster keeps its size before hydration and the subpath needs no CSS
 * import. Every rule is scoped to `[data-bitsnap-viewer3d]`.
 *
 * Theme: set the custom properties below on the viewer or an ancestor, or pass
 * `appearance` to `Product3DViewer`.
 *   --bitsnap-viewer3d-background  (#ffffff)  frame and buttons
 *   --bitsnap-viewer3d-foreground  (#171717)  text and icons
 *   --bitsnap-viewer3d-muted       (foreground at 70%)  notes under the viewer
 *   --bitsnap-viewer3d-border      (#e5e5e5)
 *   --bitsnap-viewer3d-accent      (#0a7ea5)  progress bar
 *   --bitsnap-viewer3d-radius      (0.75rem)
 */
export const VIEWER3D_STYLE_HREF = "bitsnap-react-viewer3d";

const S = "[data-bitsnap-viewer3d]";
const BG = "var(--bitsnap-viewer3d-background,#ffffff)";
const FG = "var(--bitsnap-viewer3d-foreground,#171717)";
const BORDER = "var(--bitsnap-viewer3d-border,#e5e5e5)";
const RADIUS = "var(--bitsnap-viewer3d-radius,0.75rem)";

export const VIEWER3D_CSS = `
${S}{container-type:inline-size;display:flex;flex-direction:column;gap:.75rem;font-family:inherit;color:${FG}}
${S} *{box-sizing:border-box}
${S} .bsv3d-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.bsv3d-frame{position:relative;display:flex;flex-direction:column;overflow:hidden;background:${BG};color:${FG};border:1px solid ${BORDER};border-radius:${RADIUS}}
.bsv3d-frame[data-fullscreen]{position:fixed;inset:0;z-index:2147483000;width:100vw;height:100dvh;border:0;border-radius:0}
.bsv3d-stage{position:relative;width:100%;aspect-ratio:4/3}
.bsv3d-placeholder{width:100%;aspect-ratio:4/3}
@container (min-width:48rem){${S} .bsv3d-stage,${S} .bsv3d-placeholder{aspect-ratio:16/11}}
.bsv3d-frame[data-fullscreen] .bsv3d-stage{aspect-ratio:auto;flex:1;min-height:0}
.bsv3d-canvas{position:absolute!important;inset:0}
.bsv3d-poster{pointer-events:none;position:absolute;inset:0;display:grid;place-items:center;opacity:1}
.bsv3d-poster[data-hidden]{opacity:0}
.bsv3d-poster img{width:100%;height:100%;object-fit:contain;padding:6%;display:block}
.bsv3d-poster svg{width:4rem;height:4rem;color:color-mix(in srgb,${FG} 30%,transparent)}
.bsv3d-chip{pointer-events:none;display:inline-flex;align-items:center;gap:.5rem;border-radius:999px;padding:.5rem .875rem;font-size:.875rem;line-height:1.25rem;font-weight:500;background:color-mix(in srgb,${FG} 82%,transparent);color:${BG}}
.bsv3d-chip svg{width:1rem;height:1rem;flex:none}
.bsv3d-chip[data-small]{font-size:.75rem;line-height:1rem;padding:.375rem .75rem}
.bsv3d-loading{pointer-events:none;position:absolute;inset:auto 0 0 0;display:flex;flex-direction:column;align-items:flex-start;gap:.5rem}
.bsv3d-loading .bsv3d-chip{margin:0 .75rem}
.bsv3d-bar{height:4px;width:100%;background:color-mix(in srgb,${FG} 10%,transparent)}
.bsv3d-bar>div{height:100%;background:var(--bitsnap-viewer3d-accent,#0a7ea5)}
.bsv3d-center{position:absolute;inset:0;display:grid;place-items:center;padding:1rem}
.bsv3d-button{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;height:2.75rem;padding:0 1.25rem;border:1px solid ${BORDER};border-radius:${RADIUS};background:${BG};color:${FG};font:inherit;font-size:.875rem;font-weight:600;font-variant-numeric:tabular-nums;cursor:pointer;box-shadow:0 8px 20px -10px rgb(15 23 42/.45)}
.bsv3d-button:hover{border-color:color-mix(in srgb,${FG} 40%,transparent)}
.bsv3d-button svg{width:1rem;height:1rem}
.bsv3d-button:disabled{opacity:.6;cursor:default}
.bsv3d-alert{display:flex;max-width:20rem;flex-direction:column;align-items:center;gap:.75rem;border-radius:${RADIUS};background:${BG};padding:1rem 1.25rem;text-align:center;box-shadow:0 8px 20px -10px rgb(15 23 42/.45)}
.bsv3d-alert p{margin:0;font-size:.875rem;font-weight:600}
.bsv3d-alert .bsv3d-button{height:2.5rem;box-shadow:none}
.bsv3d-unsupported{position:absolute;left:.75rem;bottom:.75rem}
.bsv3d-hint{pointer-events:none;position:absolute;inset:auto 0 4rem 0;display:flex;justify-content:center;opacity:0}
.bsv3d-hint[data-visible]{opacity:1}
.bsv3d-controls{position:absolute;left:.75rem;right:.75rem;bottom:.75rem;display:flex;align-items:flex-end;justify-content:space-between;gap:.5rem}
.bsv3d-controls>div:last-child{display:flex;flex:none;gap:.5rem}
.bsv3d-icon{display:grid;place-items:center;width:2.5rem;height:2.5rem;padding:0;border-radius:999px;border:1px solid ${BORDER};background:color-mix(in srgb,${BG} 88%,transparent);color:${FG};cursor:pointer;font:inherit}
.bsv3d-icon:hover{background:${BG};border-color:color-mix(in srgb,${FG} 35%,transparent)}
.bsv3d-icon svg{width:1rem;height:1rem}
.bsv3d-icon[data-wide]{width:auto;padding:0 1rem;font-size:.875rem;font-weight:600}
.bsv3d-close{position:absolute;top:max(.75rem,env(safe-area-inset-top));right:.75rem}
.bsv3d-close svg{width:1.25rem;height:1.25rem}
${S} button:focus-visible,${S} a:focus-visible,.bsv3d-frame button:focus-visible{outline:2px solid ${FG};outline-offset:2px}
.bsv3d-buybar{flex:none;border-top:1px solid ${BORDER};background:${BG};padding:.75rem 1rem max(.75rem,env(safe-area-inset-bottom))}
.bsv3d-buybar-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.bsv3d-buybar-name{margin:0;font-weight:600;font-size:1rem}
.bsv3d-buybar-price{margin:0;font-size:.875rem;font-variant-numeric:tabular-nums}
.bsv3d-buybar .bsv3d-button{box-shadow:none;background:${FG};color:${BG};border-color:${FG}}
.bsv3d-buybar-error{margin:.25rem 0 0;font-size:.875rem;color:#b91c1c}
.bsv3d-notes{display:flex;flex-direction:column;gap:.75rem;font-size:.75rem;line-height:1.6;color:var(--bitsnap-viewer3d-muted,color-mix(in srgb,${FG} 70%,transparent))}
.bsv3d-notes p{margin:0}
.bsv3d-notes .bsv3d-facts-title{font-size:.875rem;font-weight:600;color:${FG}}
.bsv3d-notes dl{display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;margin:.375rem 0 0}
.bsv3d-notes dl>div{display:flex;flex-direction:column}
.bsv3d-notes dd{margin:0;font-size:.875rem;font-weight:500;color:${FG};font-variant-numeric:tabular-nums}
.bsv3d-notes .bsv3d-links{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .75rem}
.bsv3d-notes a{color:inherit;font-weight:500;text-decoration:underline;text-underline-offset:2px}
@media (prefers-reduced-motion:no-preference){
.bsv3d-poster{transition:opacity .5s cubic-bezier(.16,1,.3,1)}
.bsv3d-hint{transition:opacity .3s}
.bsv3d-bar>div{transition:width .2s}
}
`;
