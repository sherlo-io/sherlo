/**
 * THE PIN TOOL: names the one stored core the SDK packs, in sherlo-core.json beside the SDK's
 * manifest. Run as `yarn core:pin --fingerprint <fingerprint>`, with PACKAGE_TOKEN set.
 *
 * Every field of the pin comes from the stored core's manifest, never from a person:
 *
 *   version     the core's own version, the one its header carries
 *   fingerprint the name the core is stored under, made from its contents
 *   runnerSha   the sherlo-runner commit it was built from
 *   sourceTree  the git tree of the core's source at that commit
 *   seamHash    the sha256 of the copy of src/sealedCore/seam.ts the core was typed against
 *
 * sherlo-runner's core build prints the fingerprint it stored. A fingerprint with no stored core is
 * refused: the build has usually not finished yet.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  describeFailure,
  packageTokenFrom,
  readFingerprintBySource,
  readStoredManifest,
  storageReaderWith,
} = require('./storedCore.js');

const PIN_FILE = path.join(__dirname, '..', 'sherlo-core.json');

/** Writes the pin for the core stored under `fingerprint`, and answers it. */
async function pinCore({ fingerprint, readStoredFile, pinFile = PIN_FILE }) {
  const manifest = await readStoredManifest(fingerprint, readStoredFile);
  const pin = {
    version: manifest.version,
    fingerprint: manifest.fingerprint,
    runnerSha: manifest.runnerSha,
    sourceTree: manifest.sourceTree,
    seamHash: manifest.seamHash,
  };
  fs.writeFileSync(pinFile, JSON.stringify(pin, null, 2) + '\n');
  return pin;
}

const USAGE = 'usage: yarn core:pin --fingerprint <fingerprint> | --source-tree <source tree>';

/** The value after `flag` in the command's arguments, if the flag is there. */
function valueAfter(flag, commandArguments) {
  const flagPosition = commandArguments.indexOf(flag);
  return flagPosition >= 0 ? commandArguments[flagPosition + 1] : undefined;
}

/**
 * The fingerprint the command names: `--fingerprint` itself, or the one sherlo-runner's by-source
 * lookup names for the `--source-tree`.
 */
async function fingerprintArgument(commandArguments, readStoredFile) {
  const fingerprint = valueAfter('--fingerprint', commandArguments);
  if (fingerprint) return fingerprint;
  const sourceTree = valueAfter('--source-tree', commandArguments);
  if (!sourceTree) throw new Error(USAGE);
  return readFingerprintBySource(sourceTree, readStoredFile);
}

module.exports = { pinCore, PIN_FILE };

if (require.main === module) {
  (async () => {
    const readStoredFile = storageReaderWith(packageTokenFrom(process.env));
    const fingerprint = await fingerprintArgument(process.argv.slice(2), readStoredFile);
    const pin = await pinCore({ fingerprint, readStoredFile });
    console.log('pinned core ' + pin.version + ' (' + pin.fingerprint + ') in sherlo-core.json');
  })().catch((error) => {
    console.error(describeFailure(error));
    process.exit(1);
  });
}
