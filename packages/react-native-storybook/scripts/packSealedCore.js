/**
 * BUILD THE SEALED JS CORE AND COPY IT INTO THE SDK'S ASSETS, run as the SDK's prepack so every
 * `yarn pack` / `npm publish` carries a freshly built core and no stale one.
 *
 * The core is built once (packages/sherlo-core/js/build.js writes sherlo-core.js), then copied into
 * the iOS and Android asset folders the SDK's `files` glob publishes. Neither copy is committed:
 * the root .gitignore holds all three paths.
 */
const fs = require('node:fs');
const path = require('node:path');
const { buildSealedCore } = require('../../sherlo-core/js/build.js');

const IOS_ASSET = path.join(__dirname, '..', 'ios', 'Resources', 'assets', 'sherlo-core.js');
const ANDROID_ASSET = path.join(__dirname, '..', 'android', 'src', 'main', 'assets', 'sherlo-core.js');

async function packSealedCore() {
  const builtCore = await buildSealedCore();
  for (const asset of [IOS_ASSET, ANDROID_ASSET]) {
    fs.mkdirSync(path.dirname(asset), { recursive: true });
    fs.copyFileSync(builtCore, asset);
    console.log('copied sherlo-core.js -> ' + path.relative(path.join(__dirname, '..'), asset));
  }
}

module.exports = { packSealedCore };

if (require.main === module) {
  packSealedCore().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
