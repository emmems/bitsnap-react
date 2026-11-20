#!/usr/bin/env node
/**
 * Size budget check for bitsnap-react, run as `pnpm size` (after `pnpm build`).
 *
 * It measures what a consumer's bundler gets, not `src/`:
 *
 *  - Every fixture in `test/size/fixtures/*.mjs` is bundled with esbuild
 *    (bundle, minify, esm, browser, splitting, metafile; react, react-dom and
 *    react/jsx-runtime external; CSS empty) and resolves `bitsnap-react`
 *    through the real `exports` map, through a symlink in `.size-tmp/`. The
 *    esbuild default conditions apply, so only the ESM `import` condition is
 *    measured (`dist/*.mjs`). CJS consumers (`require`, `dist/*.js`) are not
 *    budgeted.
 *  - JS number = gzip level 9 of every output file reachable from the entry
 *    through static `import` statements. Dynamic chunks are reported in a
 *    separate column and never counted in the budget.
 *  - Structural assertions (`forbidStatic` per fixture in the budget file):
 *    no module whose path contains one of the strings may contribute bytes to
 *    the static graph. They fail with the module name.
 *  - CSS = gzip of the files named under `css` (`dist/index.css`, later
 *    `dist/cart.css`). When `dist/cart.css` exists it must also be contained
 *    verbatim in `dist/index.css`.
 *  - Package: tarball bytes from `npm pack --dry-run --json`, the number of
 *    `dependencies`, and a deny list of names that must not be dependencies.
 *
 * Budgets live in `size-budget.json`:
 *   { "fixtures": { "<name>": { "jsGzipKB": N, "forbidStatic": ["node_modules/x/"] } },
 *     "css": { "dist/index.css": N }, "tarballBytes": N, "maxDependencies": N }
 * KB means 1024 bytes. A fixture without a budget entry is measured, shown and
 * not enforced; a budget entry without a fixture is an error.
 *
 * Usage:
 *   pnpm size                      check against size-budget.json, exit 1 if over
 *   pnpm size --update             rewrite size-budget.json with current * 1.03
 *                                  (jsGzipKB, css, tarballBytes; keeps forbidStatic
 *                                  and maxDependencies). Only for a deliberate PR.
 *   pnpm size --budget <file>      use another budget file (testing the check)
 *   pnpm size --fixture <name>     measure one fixture (repeatable); skips the
 *                                  CSS, tarball and dependency checks
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "test", "size", "fixtures");
const tmpDir = path.join(root, ".size-tmp");
const KB = 1024;

/** Package names that must never be in `dependencies` (research §3, plan-02 §2). */
const DENY_DEPENDENCIES = [
  "pnpm",
  "add",
  "checkbox",
  "dlx",
  "label",
  "motion",
  "sonner",
  "tslib",
  "shadcn",
  "tailwindcss",
  "@tailwindcss/postcss",
  "tw-animate-css",
  "postcss-prefix-selector",
  "@zootools/email-spell-checker",
  "react",
  "react-dom",
];

/** Extra externals per fixture: three and R3F are optional peers of viewer3d. */
const FIXTURE_EXTERNALS = {
  viewer3d: ["three", "@react-three/fiber", "@react-three/drei"],
};

function parseArgs(argv) {
  const args = { update: false, budget: path.join(root, "size-budget.json"), fixtures: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--update") args.update = true;
    else if (arg === "--budget") args.budget = path.resolve(argv[++i]);
    else if (arg === "--fixture") args.fixtures.push(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  // A partial run measures only some fixtures and skips CSS and tarball: it must never rewrite the budget.
  if (args.update && args.fixtures.length > 0) {
    throw new Error("--update cannot be combined with --fixture: a partial run would rewrite the budget from partial data");
  }
  return args;
}

const gzipBytes = (buffer) => gzipSync(buffer, { level: 9 }).length;
const kb = (bytes) => bytes / KB;
const fmt = (value) => value.toFixed(1);
const roundUp = (value) => Math.ceil(value * 10) / 10;

function externalsFor(name) {
  const base = ["react", "react-dom", "react/jsx-runtime"];
  const extra = FIXTURE_EXTERNALS[name] ?? [];
  // esbuild treats "pkg" as external for "pkg/sub" too, which is what we want
  // for three/examples/* and @react-three/*.
  return [...base, ...extra];
}

async function measureFixture(name) {
  const outdir = path.join(tmpDir, "out", name);
  const entry = path.join(tmpDir, `${name}.mjs`);
  writeFileSync(entry, readFileSync(path.join(fixturesDir, `${name}.mjs`)));

  const result = await build({
    entryPoints: [entry],
    outdir,
    absWorkingDir: tmpDir,
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    splitting: true,
    metafile: true,
    write: false,
    logLevel: "silent",
    external: externalsFor(name),
    loader: { ".css": "empty" },
    nodePaths: [path.join(root, "node_modules")],
  });

  const files = new Map();
  for (const file of result.outputFiles) {
    files.set(path.relative(tmpDir, file.path), file.contents);
  }
  const { outputs } = result.metafile;
  // esbuild also sets `entryPoint` on chunks that are targets of dynamic
  // imports, so match the fixture file itself.
  const entryRelative = path.relative(tmpDir, entry);
  const entryOutput = Object.keys(outputs).find(
    (key) => path.normalize(outputs[key].entryPoint ?? "") === entryRelative,
  );
  if (!entryOutput) throw new Error(`${name}: esbuild produced no entry output`);

  const closure = (start, kinds) => {
    const seen = new Set();
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      for (const edge of outputs[current].imports) {
        if (!edge.external && kinds.includes(edge.kind)) queue.push(edge.path);
      }
    }
    return seen;
  };

  const staticSet = closure(entryOutput, ["import-statement"]);
  const lazySet = new Set();
  for (const output of staticSet) {
    for (const edge of outputs[output].imports) {
      if (!edge.external && edge.kind === "dynamic-import") {
        for (const reached of closure(edge.path, ["import-statement", "dynamic-import"])) {
          if (!staticSet.has(reached)) lazySet.add(reached);
        }
      }
    }
  }

  const sum = (set) =>
    [...set].reduce((total, output) => total + gzipBytes(files.get(output)), 0);

  // Modules that contribute bytes to the static graph.
  const staticInputs = new Set();
  for (const output of staticSet) {
    for (const [input, info] of Object.entries(outputs[output].inputs)) {
      if (info.bytesInOutput > 0) staticInputs.add(input);
    }
  }

  return {
    name,
    jsBytes: sum(staticSet),
    lazyBytes: sum(lazySet),
    chunks: staticSet.size,
    staticInputs,
  };
}

function gzipOf(file) {
  return gzipBytes(readFileSync(path.join(root, file)));
}

function packageNumbers() {
  const stdout = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const [info] = JSON.parse(stdout);
  return { tarballBytes: info.size, unpackedBytes: info.unpackedSize, files: info.entryCount };
}

function table(rows) {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((row) => String(row[col]).length)));
  return rows
    .map((row) =>
      row.map((cell, col) => (col === 0 ? String(cell).padEnd(widths[col]) : String(cell).padStart(widths[col]))).join("  "),
    )
    .join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const budget = JSON.parse(readFileSync(args.budget, "utf8"));
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const failures = [];
  const partial = args.fixtures.length > 0;

  if (!existsSync(path.join(root, "dist", "index.mjs"))) {
    throw new Error("dist/ is missing: run `pnpm build` before `pnpm size`.");
  }

  const available = readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".mjs"))
    .map((file) => file.slice(0, -".mjs".length))
    .sort();
  for (const name of args.fixtures) {
    if (!available.includes(name)) throw new Error(`Unknown fixture: ${name}`);
  }
  for (const name of Object.keys(budget.fixtures ?? {})) {
    if (!available.includes(name) && !partial) {
      failures.push(`size-budget.json lists fixture "${name}" but test/size/fixtures/${name}.mjs does not exist`);
    }
  }
  const selected = partial ? args.fixtures : available;

  // 1. Bundles.
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(path.join(tmpDir, "node_modules"), { recursive: true });
  symlinkSync(root, path.join(tmpDir, "node_modules", pkg.name), "dir");

  const measured = [];
  try {
    for (const name of selected) {
      measured.push(await measureFixture(name));
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const jsRows = [["fixture", "JS gzip KB", "budget", "over/under", "lazy KB", "chunks"]];
  for (const result of measured) {
    const limit = budget.fixtures?.[result.name]?.jsGzipKB;
    const value = kb(result.jsBytes);
    let delta = "-";
    if (typeof limit === "number") {
      delta = `${value - limit >= 0 ? "+" : ""}${fmt(value - limit)}`;
      if (value > limit) {
        failures.push(
          `${result.name}: static JS ${fmt(value)} KB gzip is over the budget of ${limit} KB (${delta} KB)`,
        );
      }
    }
    jsRows.push([
      result.name,
      fmt(value),
      typeof limit === "number" ? limit : "-",
      delta,
      fmt(kb(result.lazyBytes)),
      result.chunks,
    ]);

    for (const forbidden of budget.fixtures?.[result.name]?.forbidStatic ?? []) {
      const hits = [...result.staticInputs].filter((input) => input.includes(forbidden));
      if (hits.length > 0) {
        failures.push(
          `${result.name}: static graph contains forbidden "${forbidden}" (e.g. ${hits[0]}, ${hits.length} module(s))`,
        );
      }
    }
  }
  console.log(table(jsRows));

  const current = { css: {}, tarballBytes: undefined };

  if (!partial) {
    // 2. CSS.
    const cssFiles = new Set(Object.keys(budget.css ?? {}));
    cssFiles.add("dist/index.css");
    if (existsSync(path.join(root, "dist", "cart.css"))) cssFiles.add("dist/cart.css");
    const cssRows = [["css", "gzip KB", "budget", "over/under"]];
    for (const file of [...cssFiles].sort()) {
      if (!existsSync(path.join(root, file))) {
        failures.push(`${file} is in the budget but not in the build`);
        continue;
      }
      const value = kb(gzipOf(file));
      current.css[file] = value;
      const limit = budget.css?.[file];
      let delta = "-";
      if (typeof limit === "number") {
        delta = `${value - limit >= 0 ? "+" : ""}${fmt(value - limit)}`;
        if (value > limit) failures.push(`${file}: ${fmt(value)} KB gzip is over the budget of ${limit} KB`);
      }
      cssRows.push([file, fmt(value), typeof limit === "number" ? limit : "-", delta]);
    }
    console.log(`\n${table(cssRows)}`);

    if (existsSync(path.join(root, "dist", "cart.css"))) {
      const cart = readFileSync(path.join(root, "dist", "cart.css"), "utf8");
      const index = readFileSync(path.join(root, "dist", "index.css"), "utf8");
      if (!index.includes(cart.trim())) {
        failures.push("dist/cart.css is not contained verbatim in dist/index.css");
      }
    }

    // 3. Package.
    const numbers = packageNumbers();
    current.tarballBytes = numbers.tarballBytes;
    const dependencies = Object.keys(pkg.dependencies ?? {});
    const denied = dependencies.filter((name) => DENY_DEPENDENCIES.includes(name));
    console.log(
      `\ntarball ${numbers.tarballBytes} B (${numbers.files} files, unpacked ${numbers.unpackedBytes} B)` +
        (typeof budget.tarballBytes === "number" ? `, budget ${budget.tarballBytes} B` : "") +
        `\ndependencies ${dependencies.length}` +
        (typeof budget.maxDependencies === "number" ? `, budget ${budget.maxDependencies}` : ""),
    );
    if (typeof budget.tarballBytes === "number" && numbers.tarballBytes > budget.tarballBytes) {
      failures.push(`tarball ${numbers.tarballBytes} B is over the budget of ${budget.tarballBytes} B`);
    }
    if (typeof budget.maxDependencies === "number" && dependencies.length > budget.maxDependencies) {
      failures.push(`package.json has ${dependencies.length} dependencies, budget is ${budget.maxDependencies}`);
    }
    for (const name of denied) {
      failures.push(`package.json#dependencies contains "${name}", which must not be a dependency`);
    }

    if (args.update) {
      // `--update` rewrites byte budgets only. Failures that are not about
      // bytes (forbidden dependencies, forbidStatic hits, a budget entry
      // without a fixture, too many dependencies, a missing or mismatched CSS
      // file) still fail. Only "over the budget of N KB/B" messages are bytes.
      const structural = failures.filter((failure) => !/is over the budget of /.test(failure));
      if (structural.length > 0) {
        console.error(`\nSize check failed (not about bytes, --update did not write):\n${structural.map((failure) => `  - ${failure}`).join("\n")}`);
        process.exit(1);
      }
      const next = {
        ...budget,
        fixtures: Object.fromEntries(
          measured.map((result) => [
            result.name,
            { ...budget.fixtures?.[result.name], jsGzipKB: roundUp(kb(result.jsBytes) * 1.03) },
          ]),
        ),
        css: Object.fromEntries(
          Object.entries(current.css).map(([file, value]) => [file, roundUp(value * 1.03)]),
        ),
        tarballBytes: Math.ceil(numbers.tarballBytes * 1.03),
      };
      writeFileSync(args.budget, `${JSON.stringify(next, null, 2)}\n`);
      console.log(`\nWrote ${path.relative(root, args.budget)} (current * 1.03).`);
      return;
    }
  }

  if (failures.length > 0) {
    console.error(`\nSize check failed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
    process.exit(1);
  }
  console.log("\nSize check passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
