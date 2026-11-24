// The polyfill as it ships, before it is minified: metro/polyfill.js with the engine's rules it
// shares with the mock layer (src/safeWrapping.ts) inlined, as one bare script that requires
// nothing, since Metro pastes it into the bundle before any module exists. buildMetroPlugin.sh
// builds the polyfill with it, and every test that runs the polyfill runs what it gives.
//
// esbuild, one of this package's own devDependencies, inlines the TypeScript module: ncc cannot
// load a TypeScript file with the TypeScript this repository runs, and its output is a module
// that needs `module` and `__dirname`.
const fs = require('fs');
const path = require('path');

const esbuild = require('esbuild');

const POLYFILL_PATH = path.join(__dirname, '../metro/polyfill.js');
const SHARED_RULES_PATH = path.join(__dirname, '../src/safeWrapping.ts');

/** The rules src/safeWrapping.ts shares that `polyfillSource` defines again under the same name. */
function sharedRulesCopiedIn(polyfillSource) {
  const sharedSource = fs.readFileSync(SHARED_RULES_PATH, 'utf8');
  const names = Array.from(sharedSource.matchAll(/^export function (\w+)/gm), (match) => match[1]);
  return names.filter((name) =>
    new RegExp(`function\\s+${name}\\b|\\b${name}\\s*=\\s*function\\b`).test(polyfillSource)
  );
}

/** The polyfill with the shared rules inlined; it throws when the polyfill copies one of them. */
function bundlePolyfill() {
  const copied = sharedRulesCopiedIn(fs.readFileSync(POLYFILL_PATH, 'utf8'));
  if (copied.length > 0) {
    throw new Error(
      `metro/polyfill.js defines its own ${copied.join(', ')}: use the one src/safeWrapping.ts exports`
    );
  }
  const built = esbuild.buildSync({
    entryPoints: [POLYFILL_PATH],
    bundle: true,
    format: 'iife',
    platform: 'neutral',
    target: 'es2015',
    write: false,
    logLevel: 'silent',
  });
  return built.outputFiles[0].text;
}

module.exports = { bundlePolyfill, sharedRulesCopiedIn };

if (require.main === module) {
  fs.writeFileSync(process.argv[2], bundlePolyfill());
}
