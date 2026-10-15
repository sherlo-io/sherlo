/**
 * THE PUBLIC KEY THE NATIVE LOADERS CHECK AN OVERRIDE CORE'S SIGNATURE AGAINST.
 *
 * The loaders in the repository carry a TEST key (named SHERLO_CORE_TEST_PUBLIC_KEY) whose private
 * half is kept nowhere, so a local pack - testing apps, `yarn reset` - ships a loader that refuses
 * every override core. A release replaces it with Sherlo's real public key, and refuses to pack
 * while the test key is still there. Only the public half is ever in this repository or a workflow.
 *
 * - `node scripts/sealedCoreKey.js stamp` writes the key in the SHERLO_CORE_PUBLIC_KEY environment
 *   variable (a PEM, or the base64 of its DER) into both loaders. It edits the working tree only:
 *   a release stamps right before it publishes and restores the loaders after, so the repository
 *   keeps the test key.
 * - packSealedCore.js calls refuseTestPublicKey() when SHERLO_RELEASE_BUILD is "true".
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SDK_ROOT = path.join(__dirname, '..');
const TEST_KEY_NAME = 'SHERLO_CORE_TEST_PUBLIC_KEY';
const RELEASE_KEY_NAME = 'SHERLO_CORE_PUBLIC_KEY';

// iOS reads the key as PKCS#1 RSAPublicKey DER, Android as X.509 SubjectPublicKeyInfo DER.
const LOADERS = {
  ios: { file: path.join(SDK_ROOT, 'ios', 'SherloCoreLoader.m'), derFormat: 'pkcs1' },
  android: {
    file: path.join(
      SDK_ROOT,
      'android/src/main/java/io/sherlo/storybookreactnative/SherloCoreLoader.java'
    ),
    derFormat: 'spki',
  },
};

/** Throws when either loader still carries the test key. */
function refuseTestPublicKey(loaders = LOADERS) {
  const loadersWithTestKey = Object.values(loaders)
    .filter(({ file }) => fs.readFileSync(file, 'utf8').includes(TEST_KEY_NAME))
    .map(({ file }) => path.relative(SDK_ROOT, file));

  if (loadersWithTestKey.length > 0) {
    throw new Error(
      'A release must carry Sherlo\'s public key, but ' +
        loadersWithTestKey.join(' and ') +
        ' still holds the test key. Run "node scripts/sealedCoreKey.js stamp" with ' +
        RELEASE_KEY_NAME +
        ' set before packing.'
    );
  }
}

/** Writes `publicKeyText` into each loader in place of the test key. */
function stampPublicKey(publicKeyText, loaders = LOADERS) {
  const trimmedKey = publicKeyText.trim();
  const pem = trimmedKey.startsWith('-----')
    ? trimmedKey
    : '-----BEGIN PUBLIC KEY-----\n' + trimmedKey + '\n-----END PUBLIC KEY-----';
  const publicKey = crypto.createPublicKey(pem);

  for (const { file, derFormat } of Object.values(loaders)) {
    const keyBase64 = publicKey.export({ type: derFormat, format: 'der' }).toString('base64');
    const source = fs.readFileSync(file, 'utf8');

    const declaration = new RegExp(TEST_KEY_NAME + '(\\s*=\\s*@?")[^"]*"');
    if (!declaration.test(source)) {
      throw new Error(path.relative(SDK_ROOT, file) + ' declares no ' + TEST_KEY_NAME + ' to replace');
    }
    const testKeyComment = /^([ \t]*)\/\/ THE TEST PUBLIC KEY:[^\n]*\n(?:[ \t]*\/\/[^\n]*\n)*/m;
    const stamped = source
      .replace(declaration, RELEASE_KEY_NAME + '$1' + keyBase64 + '"')
      .replace(testKeyComment, "$1// SHERLO'S PUBLIC KEY, stamped in by the release build.\n")
      .replaceAll(TEST_KEY_NAME, RELEASE_KEY_NAME);
    fs.writeFileSync(file, stamped);
  }
}

module.exports = { refuseTestPublicKey, stampPublicKey, LOADERS, TEST_KEY_NAME, RELEASE_KEY_NAME };

if (require.main === module) {
  if (process.argv[2] !== 'stamp') {
    console.error('usage: ' + RELEASE_KEY_NAME + '=<public key> node scripts/sealedCoreKey.js stamp');
    process.exit(1);
  }
  if (!process.env[RELEASE_KEY_NAME]) {
    console.error(
      RELEASE_KEY_NAME + ' is not set: it comes from the repository variable of the same name.'
    );
    process.exit(1);
  }
  stampPublicKey(process.env[RELEASE_KEY_NAME]);
  console.log('stamped Sherlo\'s public key into both loaders');
}
