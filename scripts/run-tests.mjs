// Unit-test runner behind `pnpm test`.
//
//   node scripts/run-tests.mjs <test entry files...>
//
// 1. Bundles the entry files with tsup into a directory that belongs to this
//    run alone (`.test-dist/run-<id>/`), so two `pnpm test` runs in one
//    worktree cannot overwrite each other's files, and it lists exactly the
//    built files (no glob over a shared directory).
// 2. Runs `node --test --test-force-exit` (spec output, as before). Cause of
//    the "missing tests, fail 0" runs: force-exit let a test-file process
//    exit before its last results reached the runner. scripts/test-flush-exit.mjs
//    makes it drain stdout first.
// 3. Guard: fails the run if any entry did not build, or if any built file
//    reported no tests of its own (see scripts/test-tally-reporter.mjs).
//
// The bundles stay inside the package (not in the OS temp dir) because the
// `--external jsdom` import must resolve from node_modules.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = process.argv.slice(2);
if (entries.length === 0) {
  console.error('run-tests: no test entry files given');
  process.exit(2);
}

const runId = `run-${process.pid}-${randomBytes(3).toString('hex')}`;
const outDir = join(root, '.test-dist', runId);
const tallyFile = join(root, '.test-dist', `${runId}.tally.json`);

const cleanup = () => {
  rmSync(outDir, { recursive: true, force: true });
  rmSync(tallyFile, { force: true });
};
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}

function finish(code, message) {
  if (message) console.error(`\nrun-tests: ${message}`);
  cleanup();
  process.exit(code);
}

mkdirSync(outDir, { recursive: true });

// 1. Build.
const build = spawnSync(
  join(root, 'node_modules', '.bin', 'tsup'),
  [...entries, '--format', 'esm', '--out-dir', outDir, '--no-config', '--external', 'jsdom', '--silent'],
  { cwd: root, stdio: 'inherit' },
);
if (build.status !== 0) finish(build.status ?? 1, 'tsup failed');

// tsup keeps each entry's path below the entries' deepest shared directory.
const entryDirs = entries.map((e) => dirname(e).split('/'));
let shared = entryDirs[0];
for (const parts of entryDirs) {
  let i = 0;
  while (i < shared.length && i < parts.length && shared[i] === parts[i]) i++;
  shared = shared.slice(0, i);
}
const built = entries.map((entry) => {
  const rel = relative(shared.join('/'), entry).replace(/\.tsx?$/, '.mjs');
  return { entry, file: join(outDir, ...rel.split('/')) };
});
const notBuilt = built.filter((b) => !existsSync(b.file));
if (notBuilt.length > 0) {
  finish(1, `tsup produced no output for:\n  ${notBuilt.map((b) => b.entry).join('\n  ')}`);
}

// 2. Run.
const test = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-force-exit',
    '--import=./scripts/test-flush-exit.mjs',
    '--test-reporter=./scripts/test-tally-reporter.mjs', // spec output + per-file tally
    '--test-reporter-destination=stdout',
    ...built.map((b) => b.file),
  ],
  { cwd: root, stdio: 'inherit', env: { ...process.env, TEST_TALLY_FILE: tallyFile } },
);

// 3. Guard.
let tally;
try {
  tally = JSON.parse(readFileSync(tallyFile, 'utf8'));
} catch {
  finish(1, 'no per-file tally was written; the test run did not finish');
}
const silent = built.filter((b) => !tally[b.file] || tally[b.file].tests === 0);
if (silent.length > 0) {
  finish(
    1,
    `${silent.length} test file(s) ran no tests (empty, truncated or broken module). ` +
      `The count above is missing them even though nothing failed:\n  ` +
      silent.map((b) => b.entry).join('\n  '),
  );
}
const total = Object.values(tally).reduce((sum, f) => sum + f.tests, 0);
console.log(`run-tests: ${built.length} files, every one ran tests (${total} tests)`);
finish(test.status ?? 1);
