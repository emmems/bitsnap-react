// Preloaded (`--import`) into every test-file process by scripts/run-tests.mjs.
//
// `node --test --test-force-exit` makes each test-file process call
// `process.exit()` as soon as its tests finish; many of our files leave
// jsdom/React handles open, so without it the run hangs. But exiting right
// away can cut off the tail of the file's results on the pipe to the runner,
// and the runner then reports fewer tests with `fail 0` (a whole suite or file
// "missing"; seen as 1262, 1271, ... instead of 1300, in about 5 runs of 8
// under load). Waiting for stdout to drain before exiting removes the loss.
const exit = process.exit.bind(process);
process.exit = (code) => {
  process.stdout.write('', () => exit(code));
};
