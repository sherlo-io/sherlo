/**
 * The polyfill as it ships, for every test that runs it: metro/polyfill.js requires the rules it
 * shares with the mock layer (src/safeWrapping.ts), and only scripts/bundlePolyfill.js, which the
 * package's build runs, inlines them, so its source alone does not run. The build only minifies
 * what this gives. Built once per test file.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { bundlePolyfill } = require('../../scripts/bundlePolyfill.js');

let built: string | undefined;

export function builtPolyfillSource(): string {
  built ??= bundlePolyfill() as string;
  return built;
}
