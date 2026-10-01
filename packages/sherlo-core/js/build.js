/**
 * BUILD THE SEALED JS CORE: js/src/index.ts -> sherlo-core.js.
 *
 * Steps:
 *   1. Bundle the source into one file, with no runtime import allowed - the core reaches the
 *      outside world only through the host the SDK hands its install, never through a module.
 *   2. Minify (terser).
 *   3. Scramble (javascript-obfuscator), Hermes-safe: no self-defending (it reads a function's
 *      own source text, which Hermes does not keep), light control-flow (a later task measures the
 *      hot code and may turn it up).
 *   4. Prepend the header line the native loader reads: `// sherlo-core {"version":..,"seam":..}`.
 *   5. Write sherlo-core.js (gitignored; the pack copies it into the SDK's iOS and Android assets).
 *
 * The version is the SDK's, read from lerna.json, so one release carries one version across the
 * CLI, the SDK and this core.
 */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { minify } = require('terser');
const JavaScriptObfuscator = require('javascript-obfuscator');

const HERE = __dirname;
const ENTRY = path.join(HERE, 'src', 'index.ts');
const OUTPUT = path.join(HERE, '..', 'sherlo-core.js');
const LERNA_JSON = path.join(HERE, '..', '..', '..', 'lerna.json');
// The name js/src/index.ts declares and this build defines as the version.
const VERSION_NAME = '__SHERLO_CORE_VERSION__';

async function buildSealedCore() {
  const version = JSON.parse(fs.readFileSync(LERNA_JSON, 'utf8')).version;
  const seam = seamOfTheSource();

  const bundle = esbuild.buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'neutral',
    target: 'es2018',
    write: false,
    define: { [VERSION_NAME]: JSON.stringify(version) },
  });
  const bundled = bundle.outputFiles[0].text;
  refuseAnyImport(bundled);

  // reduce_vars off: with it on, terser writes each function the core object names straight into
  // the object, and the scrambler leaves the keys of an object holding functions readable.
  const minifyOptions = { compress: { reduce_vars: false }, mangle: true };
  const minified = (await minify(bundled, minifyOptions)).code;

  const scrambled = JavaScriptObfuscator.obfuscate(minified, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 1,
    // The core object's keys are the seam's function names (enumerateStories, ...): moved into
    // the encoded string array, they are not readable in the file.
    transformObjectKeys: true,
    identifierNamesGenerator: 'hexadecimal',
    // A fixed seed: the same source always builds the same file.
    seed: 1,
    // Hermes runs no eval of its own source, and self-defending relies on reading it back.
    selfDefending: false,
    target: 'browser-no-eval',
  }).getObfuscatedCode();

  const header = '// sherlo-core ' + JSON.stringify({ version, seam }) + '\n';
  const file = header + scrambled + '\n';
  fs.writeFileSync(OUTPUT, file);

  console.log(
    'sherlo-core.js: version ' +
      version +
      ', seam ' +
      seam +
      ', ' +
      Buffer.byteLength(file) +
      ' bytes'
  );
  return OUTPUT;
}

/**
 * The core imports nothing: everything it reaches comes through the host. A bundle that still
 * requires or imports anything fails the build, before it is minified, scrambled or shipped.
 */
function refuseAnyImport(bundled) {
  const reachesOut = /\brequire\s*\(|\bimport\s*[({"'`*]|\bimport\s+[\w$]/.exec(bundled);
  if (reachesOut) {
    throw new Error(
      'the sealed core must import nothing, but its bundle has "' +
        reachesOut[0] +
        '" - reach the outside through the host instead'
    );
  }
}

/** The SEAM the source names, so the header and the source can never disagree. */
function seamOfTheSource() {
  const source = fs.readFileSync(ENTRY, 'utf8');
  const named = /const SEAM = (\d+);/.exec(source);
  if (!named) throw new Error('js/src/index.ts does not name its SEAM');
  return Number(named[1]);
}

module.exports = { buildSealedCore };

if (require.main === module) {
  buildSealedCore().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
