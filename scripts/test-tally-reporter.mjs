// Node test reporter used by scripts/run-tests.mjs. It prints exactly what the
// built-in `spec` reporter prints, and also counts, per test file, the tests
// that really ran and saves the tally as JSON to the path in TEST_TALLY_FILE.
//
// One reporter on purpose: with `--test-force-exit` the runner may exit as soon
// as the first of two reporters is done, before the second one wrote its file.
//
// Why a tally: a test file that is empty (or whose module registers no
// `test()`/`it()`) is reported by node as ONE passing "test" named after the
// file, so the run shows `fail 0` while the whole file did nothing. Those
// placeholders are not counted here, so such a file ends up with 0.
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { spec } from 'node:test/reporters';

function writeTally(perFile) {
  const out = process.env.TEST_TALLY_FILE;
  if (out) writeFileSync(out, JSON.stringify(Object.fromEntries(perFile)));
}

export default async function* tallyReporter(source) {
  const perFile = new Map();
  const tee = (async function* () {
    for await (const event of source) {
      // Node 24 emits one `test:summary` per test file that finished, with its
      // own `counts.tests`. A file whose process exited early emits none. The
      // run-wide summary has no `file`. The runner compares this number to the
      // tally, to catch a file that lost only part of its results.
      if (event.type === 'test:summary' && event.data.file) {
        const { file, counts } = event.data;
        if (!perFile.has(file)) perFile.set(file, { tests: 0, failed: 0 });
        perFile.get(file).summary = counts?.tests;
      }
      if (event.type === 'test:pass' || event.type === 'test:fail') {
        const { file, name, nesting, details } = event.data;
        if (file) {
          if (!perFile.has(file)) perFile.set(file, { tests: 0, failed: 0 });
          const isSuite = details?.type === 'suite';
          // Node's stand-in for a file that registered no tests: top level,
          // named after the file itself.
          const isPlaceholder = nesting === 0 && (name === file || name === basename(file));
          if (!isSuite && !isPlaceholder) {
            const entry = perFile.get(file);
            entry.tests += 1;
            if (event.type === 'test:fail') entry.failed += 1;
          }
        }
      }
      yield event;
    }
    // Written before spec's last chunk (the summary) is yielded below.
    writeTally(perFile);
  })();
  yield* Readable.from(tee).compose(new spec());
}
