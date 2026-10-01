/**
 * BUILD THE SEALED JS CORE: js/src/index.ts -> sherlo-core.js.
 *
 * Steps:
 *   1. Bundle the source into one file, with no runtime import allowed - the core reaches the
 *      outside world only through the host the SDK hands its install, never through a module.
 *   2. Minify (terser).
 *   3. Scramble (javascript-obfuscator), Hermes-safe: no self-defending (it reads a function's
 *      own source text, which Hermes does not keep), light control-flow. The functions a capture
 *      polls are scrambled lightly: see LIGHTLY_SCRAMBLED_MARK.
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

/**
 * The comments that mark the source's lightly-scrambled functions:
 * `/*! javascript-obfuscator:disable *\/` before them and `/*! javascript-obfuscator:enable *\/`
 * after. A capture polls a few functions every 10 ms - the metadata walk of the app's fibers, and
 * the check of each tree the inspector answers - and the encoded string lookups made them 7 to 15
 * times slower than their source (js/__tests__/scrambledCoreSpeed.test.ts). Between the marks the
 * scrambler leaves the code as terser wrote it: minified, every name mangled, no lookups. The `!`
 * keeps each mark through esbuild and terser to the scrambler, which reads it and drops it.
 */
const LIGHTLY_SCRAMBLED_MARK = /javascript-obfuscator:(disable|enable)/;

async function buildSealedCore() {
  const { file, version, seam } = await sealedCoreFile();
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

/** The built core, header line and all, without writing it anywhere - for a test to read. */
async function sealedCoreFile() {
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
    // Keeps the lightly-scrambled marks (see LIGHTLY_SCRAMBLED_MARK) where the source put them.
    legalComments: 'inline',
  });
  const bundled = bundle.outputFiles[0].text;
  refuseAnyImport(bundled);

  // reduce_vars off: with it on, terser writes each function the core object names straight into
  // the object, and the scrambler leaves the keys of an object holding functions readable.
  const minifyOptions = {
    compress: { reduce_vars: false },
    mangle: true,
    format: { comments: LIGHTLY_SCRAMBLED_MARK },
  };
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
  return { file: header + scrambled + '\n', version, seam };
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

module.exports = { buildSealedCore, sealedCoreFile };

if (require.main === module) {
  buildSealedCore().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
