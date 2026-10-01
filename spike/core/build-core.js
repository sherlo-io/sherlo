// Spike: build one sealed core file from core/src/core.js.
//
//   node spike/core/build-core.js --version 2.0.2 --out <file>                 shipped core, unsigned
//   node spike/core/build-core.js --version 2.0.3 --fix --sign --out <file>    a signed fix
//   node spike/core/build-core.js --version 6.6.6 --fix --bad-sig --out <file> a forged signature
//   node spike/core/build-core.js --keys                                       print the public keys
//
// Steps: replace the build constants, minify (terser), scramble (javascript-obfuscator), prepend
// the one header line the native loader reads, and optionally sign the whole file (RSA-SHA256).
// Tools are borrowed from the test app's node_modules - this is a spike, not a build system.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const appModules = path.join(__dirname, '../../testing/react-native/node_modules');
const terser = require(require.resolve('terser', { paths: [appModules] }));
const obfuscator = require(require.resolve('javascript-obfuscator', { paths: [appModules] }));

const KEYS_DIR = path.join(__dirname, 'keys');
const PRIVATE_KEY_FILE = path.join(KEYS_DIR, 'test-private.pem');
const SEAM = 1;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const value = (name) => args[args.indexOf(name) + 1];

  const keys = loadOrCreateKeys();
  if (flag('--keys')) {
    console.log('iOS public key (PKCS#1 DER, base64):\n' + keys.iosPublicKeyBase64);
    console.log('Android public key (X.509 SPKI DER, base64):\n' + keys.androidPublicKeyBase64);
    return;
  }

  const version = value('--version');
  const outFile = path.resolve(value('--out'));
  const readable = fs
    .readFileSync(path.join(__dirname, 'src/core.js'), 'utf8')
    .replace('__SHERLO_CORE_VERSION__', version)
    .replace('__SHERLO_CORE_FIX__', flag('--fix') ? 'yes' : 'no');

  const minified = (await terser.minify(readable, { compress: true, mangle: true })).code;
  const scrambled = obfuscator
    .obfuscate(minified, {
      compact: true,
      controlFlowFlattening: true,
      deadCodeInjection: true,
      stringArray: true,
      stringArrayEncoding: ['base64'],
      stringArrayThreshold: 1,
      identifierNamesGenerator: 'hexadecimal',
      // Hermes-safe: no self-defending (it relies on Function.prototype.toString source text).
      selfDefending: false,
      target: 'browser-no-eval',
    })
    .getObfuscatedCode();

  const header = '// sherlo-core ' + JSON.stringify({ version, seam: SEAM }) + '\n';
  const file = header + scrambled + '\n';
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, file);

  if (flag('--sign') || flag('--bad-sig')) {
    const signedBytes = flag('--bad-sig') ? Buffer.from(file + 'tampered') : Buffer.from(file);
    const signature = crypto.sign('sha256', signedBytes, keys.privateKey).toString('base64');
    fs.writeFileSync(outFile + '.sig', signature + '\n');
  }

  console.log(
    `${outFile}: version ${version}, readable ${Buffer.byteLength(readable)} B, ` +
      `minified ${Buffer.byteLength(minified)} B, sealed ${Buffer.byteLength(file)} B` +
      (flag('--sign') ? ', signed' : flag('--bad-sig') ? ', forged signature' : ', unsigned')
  );
}

function loadOrCreateKeys() {
  if (!fs.existsSync(PRIVATE_KEY_FILE)) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    fs.writeFileSync(PRIVATE_KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_FILE));
  const publicKey = crypto.createPublicKey(privateKey);
  return {
    privateKey,
    iosPublicKeyBase64: publicKey.export({ type: 'pkcs1', format: 'der' }).toString('base64'),
    androidPublicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}
