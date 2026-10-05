/**
 * READING A STORED CORE, for the pin tool (pinCore.js) and the pack (packSealedCore.js).
 *
 * sherlo-runner builds every core and stores it in Sherlo's private package storage, in a folder
 * named by the core's fingerprint: `cores/<fingerprint>/manifest.json` beside every file of the
 * core. A stored core is never overwritten, so a fingerprint always means the same bytes.
 *
 * Storage is read through the package endpoint scripts/init-env.sh downloads the API libraries
 * from, with PACKAGE_TOKEN: the endpoint answers a short-lived download address for one object.
 */
const crypto = require('node:crypto');

const PACKAGE_ENDPOINT =
  'https://8gbu9wv7jd.execute-api.eu-central-1.amazonaws.com/dev/get-package-endpoint';
const PACKAGE_TOKEN_NAME = 'PACKAGE_TOKEN';
const MANIFEST_FILE = 'manifest.json';

/** The package token from the environment, or an error that names it. */
function packageTokenFrom(env) {
  const packageToken = env[PACKAGE_TOKEN_NAME];
  if (!packageToken) {
    throw new Error(
      PACKAGE_TOKEN_NAME +
        ' is not set: the sealed core is read from Sherlo\'s package storage with it. Set ' +
        PACKAGE_TOKEN_NAME +
        ' and run again.'
    );
  }
  return packageToken;
}

/**
 * A reader of package storage: `readStoredFile(objectKey)` answers the object's bytes, or null
 * when storage holds no such object.
 */
function storageReaderWith(packageToken) {
  return async function readStoredFile(objectKey) {
    const endpointUrl =
      PACKAGE_ENDPOINT +
      '?token=' +
      encodeURIComponent(packageToken) +
      '&objectKey=' +
      encodeURIComponent(objectKey);
    const endpointAnswer = await fetch(endpointUrl);
    if (!endpointAnswer.ok) {
      throw new Error(
        'the package endpoint refused ' + objectKey + ' (HTTP ' + endpointAnswer.status + ')'
      );
    }
    const downloadUrl = (await endpointAnswer.text()).trim();

    const download = await fetch(downloadUrl);
    // Storage answers 403 or 404 for an object it does not hold.
    if (download.status === 403 || download.status === 404) return null;
    if (!download.ok) {
      throw new Error('downloading ' + objectKey + ' failed (HTTP ' + download.status + ')');
    }
    return Buffer.from(await download.arrayBuffer());
  };
}

/** The manifest of the core stored under `fingerprint`, or an error saying none is stored. */
async function readStoredManifest(fingerprint, readStoredFile) {
  const manifestBytes = await readStoredFile('cores/' + fingerprint + '/' + MANIFEST_FILE);
  if (manifestBytes === null) {
    throw new Error(
      'no core is stored under the fingerprint ' +
        fingerprint +
        '. sherlo-runner\'s core build prints the fingerprint it stored; when it has not finished, ' +
        'wait for it and run again.'
    );
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));

  // The fingerprint is made from the files the manifest lists, so a manifest under the wrong name,
  // or one listing other files, is caught here.
  const fingerprintOfItsFiles = coreFingerprint(manifest.files);
  if (manifest.fingerprint !== fingerprint || fingerprintOfItsFiles !== fingerprint) {
    throw new Error(
      'the manifest stored under ' +
        fingerprint +
        ' names the fingerprint ' +
        manifest.fingerprint +
        ', and its files make ' +
        fingerprintOfItsFiles
    );
  }
  return manifest;
}

/**
 * THE FINGERPRINT of a core, as the core's store makes it: one line per
 * file but the manifest, "<path> <sha256>", sorted, joined with "\n" and no newline after the last,
 * then the sha256 of that text.
 */
function coreFingerprint(files) {
  const lines = files.map((file) => file.path + ' ' + file.sha256).sort();
  return sha256(Buffer.from(lines.join('\n'), 'utf8'));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

module.exports = {
  PACKAGE_TOKEN_NAME,
  packageTokenFrom,
  storageReaderWith,
  readStoredManifest,
  coreFingerprint,
  sha256,
};
