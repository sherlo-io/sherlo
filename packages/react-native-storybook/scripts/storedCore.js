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

/** How many times a read is tried when the network fails: once, then twice again. */
const TRIES_ON_NETWORK_FAILURE = 3;

/** How long a read waits before it is tried again. */
const PAUSE_BETWEEN_TRIES_MS = 2000;

/** An answer from the endpoint or from storage that refuses, such as HTTP 500: never tried again. */
class StorageRefusal extends Error {}

/**
 * A reader of package storage: `readStoredFile(objectKey)` answers the object's bytes, or null
 * when storage holds no such object.
 *
 * When the network fails - no answer came back, or an answer was cut off while its body was read -
 * the whole read is tried again, up to three times in all, with a pause between tries. An answer
 * that refuses is not tried again. `fetchFromNetwork` and `pauseBetweenTriesMs` are for tests.
 */
function storageReaderWith(
  packageToken,
  { fetchFromNetwork = fetch, pauseBetweenTriesMs = PAUSE_BETWEEN_TRIES_MS } = {}
) {
  async function readOnce(objectKey) {
    const endpointUrl =
      PACKAGE_ENDPOINT +
      '?token=' +
      encodeURIComponent(packageToken) +
      '&objectKey=' +
      encodeURIComponent(objectKey);
    const endpointAnswer = await fetchFromNetwork(endpointUrl);
    if (!endpointAnswer.ok) {
      throw new StorageRefusal(
        'the package endpoint refused ' + objectKey + ' (HTTP ' + endpointAnswer.status + ')'
      );
    }
    const downloadUrl = (await endpointAnswer.text()).trim();

    const download = await fetchFromNetwork(downloadUrl);
    // Storage answers 403 or 404 for an object it does not hold.
    if (download.status === 403 || download.status === 404) return null;
    if (!download.ok) {
      throw new StorageRefusal(
        'downloading ' + objectKey + ' failed (HTTP ' + download.status + ')'
      );
    }
    return Buffer.from(await download.arrayBuffer());
  }

  return async function readStoredFile(objectKey) {
    let lastNetworkFailure;
    for (let tryNumber = 1; tryNumber <= TRIES_ON_NETWORK_FAILURE; tryNumber++) {
      if (tryNumber > 1) await pause(pauseBetweenTriesMs);
      try {
        return await readOnce(objectKey);
      } catch (error) {
        // readOnce throws only a refusal it wrote, or what fetch or a body read threw: the network.
        if (error instanceof StorageRefusal) throw error;
        lastNetworkFailure = error;
      }
    }
    throw new Error(
      'reading ' +
        objectKey +
        ' from package storage failed ' +
        TRIES_ON_NETWORK_FAILURE +
        ' times',
      { cause: lastNetworkFailure }
    );
  };
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * An error's message followed by every cause under it, so "fetch failed" also says why:
 * "fetch failed, because: other side closed (UND_ERR_SOCKET)". The scripts print this when they
 * fail.
 */
function describeFailure(error) {
  const parts = [];
  for (let current = error; current; current = current.cause) {
    if (!(current instanceof Error)) {
      parts.push(String(current));
      break;
    }
    const code = current.code ? ' (' + current.code + ')' : '';
    parts.push((current.message || current.name) + code);
  }
  return parts.join(', because: ');
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
  describeFailure,
  readStoredManifest,
  coreFingerprint,
  sha256,
};
