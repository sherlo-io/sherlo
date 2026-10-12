/**
 * LAY THE PINNED CORE INTO THE SDK, run as the SDK's prepack so every `yarn pack` and
 * `npm publish` carries exactly the core sherlo-core.json names.
 *
 * Neither core is built here: sherlo-runner builds, signs and stores every core, and this script
 * fetches the one the pin names (scripts/storedCore.js), with PACKAGE_TOKEN. It refuses:
 *
 * - no PACKAGE_TOKEN;
 * - a sherlo-core.json that is not a pin;
 * - a pin to a core that is not stored;
 * - a core that lacks one of the four parts, or a C core library for one of the four Android ABIs;
 * - a stored file whose sha256 is not the one its manifest lists;
 * - a pin whose version, runnerSha, sourceTree or seamHash differs from the stored core's manifest;
 * - a core typed against another seam: its manifest's seamHash must be the sha256 of this commit's
 *   src/sealedCore/seam.ts.
 *
 * Only once every check passed does it lay the core's four paths: sherlo-core.js into the iOS and
 * the Android asset folder, SherloCore.xcframework into ios/, and jniLibs/<abi>/libsherlocore.so
 * into android/src/main/jniLibs. None of them is committed: the root .gitignore holds every path.
 * Nothing overrides the pin.
 *
 * A release pack (SHERLO_RELEASE_BUILD=true) first refuses to run while the native loaders still
 * carry the test public key: scripts/sealedCoreKey.js says how the real one is stamped in. A local
 * pack keeps the test key.
 */
const fs = require('node:fs');
const path = require('node:path');
const { refuseTestPublicKey } = require('./sealedCoreKey.js');
const {
  describeFailure,
  packageTokenFrom,
  readStoredManifest,
  sha256,
  storageReaderWith,
} = require('./storedCore.js');

const SDK_ROOT = path.join(__dirname, '..');

/**
 * Where each file of a stored core goes in the SDK: a stored path that starts with `stored` is laid
 * at `inSdk` plus the rest of the path. The signature, sherlo-core.js.sig, is not laid: only an
 * override core a run downloads is checked against one.
 */
const LAID_PATHS = [
  { stored: 'sherlo-core.js', inSdk: 'ios/Resources/assets/sherlo-core.js' },
  { stored: 'sherlo-core.js', inSdk: 'android/src/main/assets/sherlo-core.js' },
  { stored: 'SherloCore.xcframework', inSdk: 'ios/SherloCore.xcframework' },
  { stored: 'jniLibs', inSdk: 'android/src/main/jniLibs' },
];

/** Every Android ABI the SDK ships a C core library for. */
const ANDROID_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

/** The pin's fields besides the fingerprint, which the stored core's manifest says too. */
const PIN_FIELDS_THE_MANIFEST_REPEATS = ['version', 'runnerSha', 'sourceTree', 'seamHash'];

/** The pin, sherlo-core.json beside the SDK's manifest, or an error saying it is not one. */
function readPin(sdkRoot) {
  const notAPin = (reason) =>
    new Error(
      'sherlo-core.json is not a pin: ' +
        reason +
        '. Write it with yarn core:pin --fingerprint <fingerprint>, never by hand.'
    );
  let pin;
  try {
    pin = JSON.parse(fs.readFileSync(path.join(sdkRoot, 'sherlo-core.json'), 'utf8'));
  } catch (error) {
    throw notAPin(error.message);
  }
  if (typeof pin?.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(pin.fingerprint)) {
    throw notAPin('it names no fingerprint of 64 hex characters');
  }
  return pin;
}

/** Whether the stored path is `stored` itself or a file inside the folder `stored`. */
function isStoredUnder(storedPath, stored) {
  return storedPath === stored || storedPath.startsWith(stored + '/');
}

/** The SDK paths a stored file is laid at: none for a file the SDK does not carry. */
function sdkPathsOf(storedPath) {
  return LAID_PATHS.filter(({ stored }) => isStoredUnder(storedPath, stored)).map(
    ({ stored, inSdk }) => inSdk + storedPath.slice(stored.length)
  );
}

/**
 * Fetches, checks and lays the pinned core. `readStoredFile` reads package storage (see
 * storedCore.js); left out, it is made from PACKAGE_TOKEN.
 */
async function packSealedCore({ sdkRoot = SDK_ROOT, readStoredFile } = {}) {
  if (process.env.SHERLO_RELEASE_BUILD === 'true') refuseTestPublicKey();
  const readCoreFile = readStoredFile ?? storageReaderWith(packageTokenFrom(process.env));

  const pin = readPin(sdkRoot);
  const manifest = await readStoredManifest(pin.fingerprint, readCoreFile);

  for (const field of PIN_FIELDS_THE_MANIFEST_REPEATS) {
    if (pin[field] !== manifest[field]) {
      throw new Error(
        'sherlo-core.json says ' + field + ' is ' + pin[field] + ', but the stored core ' +
          pin.fingerprint + ' says ' + manifest[field] + '. Repin: yarn core:pin.'
      );
    }
  }

  const sdkSeamHash = sha256(fs.readFileSync(path.join(sdkRoot, 'src', 'sealedCore', 'seam.ts')));
  if (manifest.seamHash !== sdkSeamHash) {
    throw new Error(
      'core ' +
        pin.fingerprint +
        ' was typed against the seam ' +
        manifest.seamHash +
        ', but this commit\'s src/sealedCore/seam.ts hashes to ' +
        sdkSeamHash +
        '. A change to seam.ts lands with a repin to a core built against it: yarn core:pin.'
    );
  }

  for (const { stored } of LAID_PATHS) {
    const storesIt = manifest.files.some((file) => isStoredUnder(file.path, stored));
    if (!storesIt) throw new Error('core ' + pin.fingerprint + ' stores no ' + stored);
  }
  const missingAbis = ANDROID_ABIS.filter(
    (abi) => !manifest.files.some((file) => file.path === 'jniLibs/' + abi + '/libsherlocore.so')
  );
  if (missingAbis.length > 0) {
    throw new Error(
      'core ' + pin.fingerprint + ' stores no C core library for ' + missingAbis.join(', ')
    );
  }

  const coreFolderKey = 'cores/' + pin.fingerprint + '/';
  const laidFiles = await Promise.all(
    manifest.files
      .filter((file) => sdkPathsOf(file.path).length > 0)
      .map(async (file) => {
        const bytes = await readCoreFile(coreFolderKey + file.path);
        if (bytes === null) {
          throw new Error('core ' + pin.fingerprint + ' is missing its file ' + file.path);
        }
        if (sha256(bytes) !== file.sha256) {
          throw new Error(
            'the stored ' + file.path + ' of core ' + pin.fingerprint +
              ' does not have the sha256 its manifest lists'
          );
        }
        return { storedPath: file.path, bytes };
      })
  );

  for (const { inSdk } of LAID_PATHS) {
    fs.rmSync(path.join(sdkRoot, inSdk), { recursive: true, force: true });
  }
  for (const { storedPath, bytes } of laidFiles) {
    for (const sdkPath of sdkPathsOf(storedPath)) {
      fs.mkdirSync(path.dirname(path.join(sdkRoot, sdkPath)), { recursive: true });
      fs.writeFileSync(path.join(sdkRoot, sdkPath), bytes);
    }
  }
  console.log('laid core ' + manifest.version + ' (' + pin.fingerprint + ') into the SDK');
}

module.exports = { packSealedCore, LAID_PATHS };

if (require.main === module) {
  packSealedCore().catch((error) => {
    console.error(describeFailure(error));
    process.exit(1);
  });
}
