# Cart performance script

`cart-open.mjs` measures how long the cart drawer takes to show its first item and how long a
quantity `+` / Remove takes to update line, total and count, with Fast 3G + 4x CPU set through CDP.
It is not part of the package (`files`) and not part of `pnpm test`.
Plan: `docs/bitsnap-react-cart/plan-01-performance.md` section 2.1.

No dependency is added: Playwright is looked up on the machine (`PLAYWRIGHT_MODULE_DIR`, the repo,
the npx cache; the first one whose Chromium is installed wins) and the harness page is bundled with
the repo's own `esbuild`. The harness is ESM with code splitting, so the SDK's dynamic `import()`
chunks are separate files fetched over the throttled network, as in a shop.

## Targets

- **harness** (default): a minimal page + `mock-api.mjs` (cross-origin, `max-age=60` + `Vary: Origin`
  on `/products`, no preflight `Max-Age`, 100 ms server time, wallet RPCs answer "not available" with a
  200 in the Connect binary format, encoded with the generated protos in `src/gen`) with the SDK from
  `--sdk <dist dir>` (default `./dist`, so run `pnpm build` first, or point it at any build, also an
  unpacked npm tarball).
- **live**: a real shop page, `--url` is required (use a test project, never a merchant's shop). Only adds
  to the cart and opens it. Never checkout, never pay. The `remove` scenario is harness only.
  **The live target can never pass `--check`:** `remove` is harness-only and `drawerMs` (the add-then-open
  split) is harness-only too, so A7 `remove` and A3 report "not measured" / no drawer time and FAIL. Use live
  runs for numbers, and the harness for the gate.

```sh
node scripts/perf/cart-open.mjs                                  # all scenarios, 5 warm-up + 20 runs
node scripts/perf/cart-open.mjs --scenarios reopen,qty --runs 5  # quick look
node scripts/perf/cart-open.mjs --qty-cache-miss --scenarios qty # + with the HTTP cache off at the click
node scripts/perf/cart-open.mjs --target live --url <shop product page> \
  --add-selector 'button:has-text("Add to cart")' --dismiss "Reject all" --runs 10
```

Scenarios: `cold-no-snapshot` (click 2 s after load), `cold-immediate`, `snapshot-reload`,
`snapshot-offline`, `reopen` (second open = render floor at 4x CPU), `add-then-open`, `qty`, `remove`,
`qty-burst`. Every run uses a fresh browser context; a browser that disconnects is launched again.
p95 is nearest-rank; it is "never" when more than 5 % of the runs failed. `--json <file>` keeps every run
with its request timeline, the script version, the Playwright and Chromium versions.

Throttling: the cold scenarios (`cold-*`) switch Fast 3G + 4x CPU on **before** the page loads, so an idle
prefetch right after the SDK mounts cannot run on the fast link. All other scenarios throttle after the
page has loaded (a throttled load would only add minutes).

What is measured:

- items visible: click to the first `[data-bitsnap-checkout-slot="product"]` with text.
- `add-then-open`: `addMs` is the add promise; `drawerMs` runs from the moment it resolved (just before
  `showCart`) to the first item.
- `qty` / `remove`: from the click until the **first line**, the **total** (`totalValue` slot) and the
  **count** (text of the cart trigger) have all changed; `localWriteMs` is the first `localStorage`
  write of `checkout` after the click. A7 wants each of the three to change at or after that write
  (1 ms clock slack) and within 50 ms of it. For `remove` the line counts as gone when the list has one
  line less that auto-animate is not still fading out.
- Skeleton: an element matching `[data-slot="skeleton"]` (today's `ui/skeleton`),
  `[data-bitsnap-checkout-slot="skeleton"]` or `.bsc-skeleton` (the 1.32.0 redesign) inside
  `[role="dialog"]`. `cold-immediate` has no snapshot and no answer yet, so every SDK must show one
  there; when none of its runs saw one the script prints a WARNING and `--check` fails the "skeleton marker"
  row, because "no skeleton frame" (A1) would otherwise pass for the wrong reason. If an SDK really paints
  items at once there, pass `--skip-skeleton-check`.

## Gate (before 1.32.0, p95 of 20 runs)

Measure the baseline SDK once, with this script version, and keep the JSON. Then build the SDK under test and
run the same target against that baseline:

```sh
# baseline (today's main, built from git archive; see perf-baseline.md)
node scripts/perf/cart-open.mjs --sdk <baseline dist> --runs 20 --warmup 5 --json <docs>/perf-baseline-data/harness-main-v2.json
# the gate
pnpm build
node scripts/perf/cart-open.mjs --sdk dist --runs 20 --warmup 5 --check \
  --baseline <docs>/perf-baseline-data/harness-main-v2.json --json /tmp/cart-gate.json
```

`--check` prints PASS/FAIL for A1, A2, A3, A4, A7 and exits 1 on a miss (2 when it cannot run). It is strict:

- A criterion whose scenario did not run is printed as FAIL "not measured".
- A2 and A3 need the baseline (`cold-no-snapshot` p95, `add-then-open` drawer p95); without `--baseline`, or with
  a null value in it, they FAIL.
- The render floor is the baseline's `reopen` p95 (or `--render-floor <ms>` if you give one); `--check`
  refuses to run with neither, because a floor taken from the run's own `reopen` makes A1 compare it with itself.
- A baseline written by another script version (`scriptVersion` in the JSON) is refused: the numbers do not compare.
- A3: the drawer time (from the add promise) passes when it is <= max(50 % of the baseline drawer p95, the A1 limit).
- A4 is a p95 over the runs, measured from the drawer's first commit (`mountMs`: the dialog appears in the DOM),
  not from the click. On `reopen`, no `POST /payment-methods` is a pass (cached answer); a p95 later than 50 ms
  after the mount, or a POST that starts after a `/products` that took network time, is a fail. A POST that
  started before the click is counted and fails separately ("started before the click"). Cold scenarios must send one.
- A7 `qty-burst`: exactly one `POST /payment-methods` for three clicks in 200 ms, in every run.

Commit the numbers to `perf-baseline.md`. Run it when the machine is quiet (`fleet-load-gate status` = ok)
and record the load.

## Limits

- CDP network emulation adds the latency to each request; it does not model DNS/TCP/TLS setup, and
  a CORS preflight on localhost is not delayed (2-4 ms observed). The harness therefore understates
  cold-connection and preflight cost (A5, RC2/RC3); the live target includes the real connection.
- The mock API is not the backend: product data is made up. Wallet RPCs answer "not available";
  `express/availability` still answers 404 (an unknown route).
- `radix-ui-shim.js` is used only when the umbrella `radix-ui` package is missing from `node_modules`.
