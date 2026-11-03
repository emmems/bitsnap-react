import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setupReactPage } from "../analytics/react-testing";
import { getChatTexts } from "./texts";
import type { ChatMessage } from "./types";
import { mapMessage } from "./client";
import { replaceUpdatedMessage } from "./useConversation";
import { chatMessagePreview } from "./PanelMessages";

const page = setupReactPage("https://shop.example.test/chat");
let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PaymentRequestCard: typeof import("./Conversation").PaymentRequestCard;
const roots: Array<{ unmount: () => void }> = [];

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ PaymentRequestCard } = await import("./Conversation.tsx"));
});
after(async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
});

const message = (patch: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1", threadId: "t1", authorEmail: "creator@example.test", body: "", kind: "payment_request",
  paymentRequest: {
    requestId: "r1", title: "Consultation", description: "Please include context.", amountMode: "exact",
    amountMinor: 2500, minAmountMinor: null, maxAmountMinor: null, currency: "PLN", extraReplies: 2,
    extendExpiryDays: 3, paymentUrl: "https://bitsnap.pl/l/abc", status: "pending",
    expiresAt: "2099-01-01T00:00:00Z", paidAt: null,
  }, createdAt: "2026-11-01T10:00:00Z", pinned: false, deleted: false, system: false, ...patch,
});

async function render(msg: ChatMessage, mine = false) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(React.createElement(PaymentRequestCard, { message: msg, mine, texts: getChatTexts(undefined, "pl-PL"), locale: "pl-PL" })));
  return container;
}

describe("payment request card", () => {
  it("replaces an updated message by id, ignores unknown ids, and previews the title", () => {
    const original = message();
    const updated = { ...original, paymentRequest: { ...original.paymentRequest!, status: "paid" as const } };
    const list = [original, { ...original, id: "m2" }];
    const replaced = replaceUpdatedMessage(list, updated);
    assert.equal(replaced[0].paymentRequest?.status, "paid");
    assert.equal(replaced[1].id, "m2", "update preserves ordering");
    assert.equal(replaceUpdatedMessage(list, { ...updated, id: "missing" }), list, "unknown update is ignored");
    const mapped = mapMessage({ ...{
      id: "m1", thread_id: "t1", author_email: "creator@example.test", body: "", kind: "payment_request",
      payment_request: { request_id: "r", title: "Consultation", description: "", amount_mode: "exact", amount_minor: 100,
        min_amount_minor: null, max_amount_minor: null, currency: "PLN", extra_replies: 1, extend_expiry_days: 0,
        payment_url: "https://bitsnap.pl/l/id", status: "pending", expires_at: "2099-01-01T00:00:00Z", paid_at: null },
    } });
    assert.equal(chatMessagePreview(mapped, getChatTexts(undefined, "pl-PL")), "Prośba o płatność: Consultation");
  });
  it("renders exact pending details and opens the payment URL in a new tab", async () => {
    const original = page.win.open;
    let opened: unknown[] = [];
    page.win.open = ((...args: unknown[]) => { opened = args; return null; }) as typeof page.win.open;
    try {
      const card = await render(message());
      assert.match(card.textContent ?? "", /25,00\s*zł/);
      assert.match(card.textContent ?? "", /\+2 odpowiedzi/);
      assert.match(card.textContent ?? "", /\+3 dni ważności/);
      assert.ok(card.querySelector("article[aria-label='Consultation']"));
      (card.querySelector("button") as HTMLButtonElement).click();
      assert.deepEqual(opened, ["https://bitsnap.pl/l/abc", "_blank", "noopener,noreferrer"]);
    } finally { page.win.open = original; }
  });

  it("renders paid, expired, cancelled, and treats past pending expiry as expired", async () => {
    const paid = await render(message({ paymentRequest: { ...message().paymentRequest!, status: "paid" } }));
    assert.match(paid.textContent ?? "", /Opłacone/);
    assert.equal(paid.querySelector("button"), null);
    const expired = await render(message({ paymentRequest: { ...message().paymentRequest!, status: "expired" } }));
    assert.match(expired.textContent ?? "", /Prośba wygasła/);
    const cancelled = await render(message({ paymentRequest: { ...message().paymentRequest!, status: "cancelled" } }));
    assert.match(cancelled.textContent ?? "", /Prośba anulowana/);
    const past = await render(message({ paymentRequest: { ...message().paymentRequest!, expiresAt: "2000-01-01T00:00:00Z" } }));
    assert.match(past.textContent ?? "", /Prośba wygasła/);
  });

  it("renders PWYW range and hides payment controls in creator mode", async () => {
    const request = { ...message().paymentRequest!, amountMode: "pwyw" as const, minAmountMinor: 1000, maxAmountMinor: 9000 };
    const buyer = await render(message({ paymentRequest: request }));
    assert.match(buyer.textContent ?? "", /od 10,00\s*zł do 90,00\s*zł/);
    assert.match(buyer.textContent ?? "", /Wybierz kwotę i zapłać/);
    const creator = await render(message({ paymentRequest: request }), true);
    assert.equal(creator.querySelector("button"), null);
  });

  it("shows the safe fallback for malformed snapshots", async () => {
    const card = await render(message({ paymentRequest: undefined, paymentRequestInvalid: true }));
    assert.equal(card.textContent, "Prośba o płatność — odśwież czat, aby ją zobaczyć");
  });
});
