// A stand-in for the Bitsnap public-commerce API, for scripts/perf/cart-open.mjs.
//
// The cart SDK talks to `https://bitsnap.pl` (or `data-custom-host`). To measure it
// with CDP network throttling the answers have to come over a real socket, so this
// is a small node http server that behaves like the live one where it matters for
// timing: cross-origin (so preflights happen), `Cache-Control: max-age=60` +
// `Vary: Origin` on /products, no `Access-Control-Max-Age` on preflights, and a
// fixed server time per call. It is NOT the backend: product data is made up.

import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PRODUCT_IDS = ["perf-1", "perf-2", "perf-3"];

const svg = (color) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${color}"/></svg>`,
  )}`;

function product(id, index) {
  const price = 4990 + index * 1000;
  return {
    id,
    name: `Perf product ${index + 1}`,
    description: null,
    price,
    currency: "PLN",
    metadata: {},
    image_url: svg(["#6366f1", "#0ea5e9", "#10b981"][index % 3]),
    isDeliverable: false,
    pricing: { effectivePrice: price, regularPrice: price, priceVersion: `v-${id}` },
  };
}

const COUNTRIES = [
  { name: "Poland", code: "PL" },
  { name: "Germany", code: "DE" },
];

const ALLOWED_HEADERS =
  "Content-Type, X-Bitsnap-Client, X-Bitsnap-Cart-Token, X-Bitsnap-Visitor, X-Bitsnap-Session, Authorization, Connect-Protocol-Version, Connect-Timeout-Ms, Grpc-Timeout, X-Grpc-Web, X-User-Agent";

/**
 * Encodes the answers of the checkout RPCs with the SDK's own generated protos (`src/gen/proto/public/v1`), so
 * the mock cannot drift from the schema. Bundles a tiny entry with esbuild into `outDir` and imports it.
 * Returns `{ <Method>: { proto: Uint8Array, json: object } }` for `startMockApi({ rpcBodies })`.
 */
export async function buildRpcBodies({ repoRoot, outDir, esbuild }) {
  const gen = path.join(repoRoot, "src/gen/proto/public/v1/public_api_pb.ts");
  const outfile = path.join(outDir, "rpc-bodies.mjs");
  esbuild.buildSync({
    stdin: {
      contents: `
        import { create, toBinary, toJson } from "@bufbuild/protobuf";
        import { IsOneClickPaymentAvailableResponseSchema, GetPreOrderDetailsResponseSchema } from ${JSON.stringify(gen)};
        const encode = (schema, init) => {
          const message = create(schema, init);
          return { proto: toBinary(schema, message), json: toJson(schema, message) };
        };
        export const bodies = {
          // Nothing one-click is available on the shop.
          IsOneClickPaymentAvailable: encode(IsOneClickPaymentAvailableResponseSchema, { inpostPay: false, applePay: false, googlePay: false }),
          GetPreOrderDetails: encode(GetPreOrderDetailsResponseSchema, { methods: [], currency: "PLN", country: "PL" }),
        };`,
      resolveDir: repoRoot,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    nodePaths: [path.join(repoRoot, "node_modules")],
    logLevel: "error",
  });
  return (await import(pathToFileURL(outfile).href)).bodies;
}

/**
 * @param {{ serverDelayMs?: number, preflightMaxAge?: number | null, productsCacheSeconds?: number, rpcBodies?: Record<string, { proto: Uint8Array, json: object }> }} [options]
 *   preflightMaxAge: seconds sent as Access-Control-Max-Age, or null (default, like prod today) for none.
 *   rpcBodies: from `buildRpcBodies`; without it every RPC answers a Connect "unimplemented" error.
 * @returns {Promise<{ port: number, origin: string, requests: Array<{ method: string, path: string, at: number }>, close: () => Promise<void> }>}
 */
export async function startMockApi(options = {}) {
  const delay = options.serverDelayMs ?? 100;
  const maxAge = options.preflightMaxAge ?? null;
  const cacheSeconds = options.productsCacheSeconds ?? 60;
  const rpcBodies = options.rpcBodies;
  const requests = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    requests.push({ method: req.method ?? "GET", path: url.pathname, at: Date.now() });
    const origin = req.headers.origin;
    const cors = {
      ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
    const send = (status, body, extra = {}) => {
      setTimeout(() => {
        res.writeHead(status, { "Content-Type": "application/json", ...cors, ...extra });
        res.end(JSON.stringify(body));
      }, delay);
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...cors, ...(maxAge == null ? {} : { "Access-Control-Max-Age": String(maxAge) }) });
      res.end();
      return;
    }
    req.resume();
    if (url.pathname.endsWith("/public-commerce/products")) {
      const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
      const result = ids.map((id) => product(id, Math.max(0, PRODUCT_IDS.indexOf(id))));
      send(200, { success: true, result }, {
        "Cache-Control": `max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=60, stale-if-error=60`,
      });
    } else if (url.pathname.endsWith("/public-commerce/countries")) {
      send(200, COUNTRIES);
    } else if (url.pathname.endsWith("/public-commerce/payment-methods")) {
      send(200, { success: true, choice: null });
    } else if (url.pathname.startsWith("/api/rpc/")) {
      // Connect unary RPC: /api/rpc/<service>/<Method>. The SDK sends binary (application/proto); answer in the
      // format of the request. Wallet availability answers "not available" with a 200, like prod for a shop
      // without Apple Pay / Google Pay / InPost Pay; anything else is a Connect "unimplemented" error.
      const method = url.pathname.split("/").pop();
      const body = rpcBodies?.[method];
      const binary = (req.headers["content-type"] ?? "").startsWith("application/proto");
      if (body && binary) {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/proto", ...cors });
          res.end(Buffer.from(body.proto));
        }, delay);
      } else if (body) {
        send(200, body.json);
      } else {
        send(404, { code: "unimplemented", message: `perf mock: no answer for ${method}` });
      }
    } else {
      send(404, { success: false, message: "perf mock: unknown route" });
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    port,
    origin: `http://localhost:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
