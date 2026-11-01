import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import { setupReactPage } from "@/src/analytics/react-testing";
import {
  GetLoginBrandingRequestSchema,
  GetLoginBrandingResponseSchema,
} from "@/src/gen/proto/public/v1/public_api_pb";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let RpcProvider: typeof import("@/src/rpc-provider").RpcProvider;
let LoginBrandLogo: typeof import("./LoginBrandLogo.tsx").LoginBrandLogo;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ RpcProvider } = await import("@/src/rpc-provider"));
  ({ LoginBrandLogo } = await import("./LoginBrandLogo.tsx"));
});

const roots: Array<{ unmount: () => void }> = [];
const originalFetch = globalThis.fetch;
type Reply = MessageInitShape<typeof GetLoginBrandingResponseSchema> | "fail" | "hang";
let reply: Reply;
let requested: string[];

beforeEach(() => {
  reply = {};
  requested = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    if (!String(input).endsWith("/GetLoginBranding")) return new Response(null, { status: 202 });
    requested.push(fromBinary(GetLoginBrandingRequestSchema, init!.body as Uint8Array).projectId);
    if (reply === "hang") return new Promise<Response>(() => {});
    if (reply === "fail") return new Response("{}", { status: 500 });
    return new Response(
      toBinary(GetLoginBrandingResponseSchema, create(GetLoginBrandingResponseSchema, reply)) as BodyInit,
      { status: 200, headers: { "Content-Type": "application/proto" } },
    );
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
});

const doc = () => page.win.document;
const settle = (ms = 40) =>
  React.act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
const images = () => Array.from(doc().querySelectorAll("img"));
const bitsnap = () => doc().querySelector('[role="img"][aria-label="Bitsnap"]');

async function mount(element: React.ReactElement) {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(<RpcProvider>{element}</RpcProvider>));
  await settle();
}

describe("LoginBrandLogo", () => {
  it("shows the shop logo, light and dark, with the shop name as alt text", async () => {
    reply = { name: "Lece na kodach", logoUrl: "https://cdn.test/l.png", logoDarkUrl: "https://cdn.test/d.png" };
    await mount(<LoginBrandLogo projectId="proj1" />);
    assert.deepEqual(requested, ["proj1"]);
    assert.deepEqual(images().map((img) => img.getAttribute("src")), ["https://cdn.test/l.png", "https://cdn.test/d.png"]);
    assert.ok(images().every((img) => img.alt === "Lece na kodach"));
    assert.match(images()[0].className, /dark:hidden/);
    assert.match(images()[1].className, /dark:block/);
    assert.equal(bitsnap(), null);
  });

  it("uses one image when the shop has a single logo", async () => {
    reply = { name: "Shop", logoUrl: "https://cdn.test/l.png" };
    await mount(<LoginBrandLogo projectId="proj1" />);
    assert.equal(images().length, 1);
    assert.equal(images()[0].getAttribute("src"), "https://cdn.test/l.png");
  });

  it("falls back to the Bitsnap logo when the shop has no logo", async () => {
    reply = { name: "Shop" };
    await mount(<LoginBrandLogo projectId="proj1" />);
    assert.equal(images().length, 0);
    assert.ok(bitsnap());
  });

  it("falls back to the Bitsnap logo when the request fails", async () => {
    reply = "fail";
    await mount(<LoginBrandLogo projectId="proj1" />);
    assert.ok(bitsnap());
  });

  it("falls back when the image does not load", async () => {
    reply = { logoUrl: "https://cdn.test/gone.png" };
    await mount(<LoginBrandLogo projectId="proj1" />);
    await React.act(async () => void images()[0].dispatchEvent(new page.win.Event("error")));
    assert.equal(images().length, 0);
    assert.ok(bitsnap());
  });

  it("keeps its height and shows nothing while the shop is loading", async () => {
    reply = "hang";
    await mount(<LoginBrandLogo projectId="proj1" />);
    const box = doc().querySelector("div > div");
    assert.match(box?.className ?? "", /\bh-10\b/);
    assert.equal(images().length, 0);
    assert.equal(bitsnap(), null);
  });

  it("is Bitsnap's logo without a project, and does not ask", async () => {
    await mount(<LoginBrandLogo />);
    assert.ok(bitsnap());
    assert.deepEqual(requested, []);
  });

  it("can be hidden, and a given logo needs no request", async () => {
    await mount(<LoginBrandLogo projectId="proj1" showLogo={false} />);
    assert.equal(doc().querySelector("img, [role=img]"), null);
    await mount(<LoginBrandLogo projectId="proj1" logoUrl="https://cdn.test/own.png" name="Own" />);
    assert.deepEqual(requested, []);
    assert.equal(images()[0].getAttribute("src"), "https://cdn.test/own.png");
    assert.equal(images()[0].alt, "Own");
  });

  it("reads the branding once for the same project on a page", async () => {
    reply = { name: "Shop", logoUrl: "https://cdn.test/l.png" };
    await mount(
      <>
        <LoginBrandLogo projectId="proj1" />
        <LoginBrandLogo projectId="proj1" />
      </>,
    );
    assert.deepEqual(requested, ["proj1"]);
  });
  it("a failing hidden dark variant does not hide the working light logo", async () => {
    reply = { name: "Shop", logoUrl: "https://cdn.test/l.png", logoDarkUrl: "https://cdn.test/gone-dark.png" };
    await mount(<LoginBrandLogo projectId="proj1" />);
    assert.equal(images().length, 2);
    await React.act(async () => void images()[1].dispatchEvent(new page.win.Event("error")));
    // The light logo serves both themes; Bitsnap's logo stays away.
    assert.deepEqual(images().map((img) => img.getAttribute("src")), ["https://cdn.test/l.png"]);
    assert.equal(bitsnap(), null);
  });

  it("a failing light variant is replaced by the dark one in both themes", async () => {
    reply = { name: "Shop", logoUrl: "https://cdn.test/gone-light.png", logoDarkUrl: "https://cdn.test/d.png" };
    await mount(<LoginBrandLogo projectId="proj1" />);
    await React.act(async () => void images()[0].dispatchEvent(new page.win.Event("error")));
    assert.deepEqual(images().map((img) => img.getAttribute("src")), ["https://cdn.test/d.png"]);
    assert.equal(bitsnap(), null);
  });

  it("falls back to Bitsnap only when both variants fail", async () => {
    reply = { name: "Shop", logoUrl: "https://cdn.test/a.png", logoDarkUrl: "https://cdn.test/b.png" };
    await mount(<LoginBrandLogo projectId="proj1" />);
    await React.act(async () => void images()[1].dispatchEvent(new page.win.Event("error")));
    assert.equal(bitsnap(), null);
    await React.act(async () => void images()[0].dispatchEvent(new page.win.Event("error")));
    assert.equal(images().length, 0);
    assert.ok(bitsnap());
  });

  it("tries a new URL after the old one failed", async () => {
    const container = doc().createElement("div");
    doc().body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const render = (url: string) =>
      React.act(async () =>
        root.render(
          <RpcProvider>
            <LoginBrandLogo projectId="proj1" logoUrl={url} />
          </RpcProvider>,
        ),
      );
    await render("https://cdn.test/gone.png");
    await React.act(async () => void images()[0].dispatchEvent(new page.win.Event("error")));
    assert.ok(bitsnap());
    await render("https://cdn.test/new.png");
    assert.deepEqual(images().map((img) => img.getAttribute("src")), ["https://cdn.test/new.png"]);
    assert.equal(bitsnap(), null);
    // The URL that failed stays failed.
    await render("https://cdn.test/gone.png");
    assert.ok(bitsnap());
  });

  it("never leaves a shop logo without alt text, in the language of the page", async () => {
    await mount(<LoginBrandLogo logoUrl="https://cdn.test/own.png" />);
    assert.equal(images()[0].alt, "Logo sklepu");
    await mount(<LoginBrandLogo logoUrl="https://cdn.test/own.png" locale="en" />);
    assert.equal(images()[1].alt, "Shop logo");
    await mount(<LoginBrandLogo logoUrl="https://cdn.test/own.png" locale="en" name="Own" />);
    assert.equal(images()[2].alt, "Own");
    assert.ok(images().every((img) => img.alt !== ""));
  });

  it("names the Bitsnap fallback 'Bitsnap'", async () => {
    await mount(<LoginBrandLogo locale="en" />);
    assert.equal(bitsnap()?.getAttribute("aria-label"), "Bitsnap");
  });

  it("renders the pending box on the server: reserved height, no image, no Bitsnap logo", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(
      <RpcProvider>
        <LoginBrandLogo projectId="proj1" className="px-4" />
      </RpcProvider>,
    );
    assert.match(html, /<div class="[^"]*\bh-10\b[^"]*\bpx-4\b[^"]*" aria-hidden="true"><\/div>/);
    assert.doesNotMatch(html, /<img|Bitsnap|bitsnap\./);
    const given = renderToString(
      <RpcProvider>
        <LoginBrandLogo logoUrl="https://cdn.test/own.png" locale="en" />
      </RpcProvider>,
    );
    assert.match(given, /<img[^>]*src="https:\/\/cdn\.test\/own\.png"/);
    assert.match(given, /alt="Shop logo"/);
  });
});
