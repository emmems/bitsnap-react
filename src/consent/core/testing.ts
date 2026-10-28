import { JSDOM } from "jsdom";

/** Fresh jsdom page installed as the global window/document. */
export function setupDom(body = "", url = "https://shop.example.test/") {
  const dom = new JSDOM(`<!doctype html><html lang="pl"><body>${body}</body></html>`, { url });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  return dom;
}

export function shadowOf(doc: Document): ShadowRoot | null {
  return doc.getElementById("bitsnap-consent")?.shadowRoot ?? null;
}

export function clickButton(root: ParentNode, text: string) {
  const button = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === text);
  if (!button) throw new Error(`no button "${text}"`);
  button.click();
}

export function visible(root: ParentNode, selector: string): boolean {
  const node = root.querySelector<HTMLElement>(selector);
  return !!node && !node.hidden;
}
