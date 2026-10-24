/**
 * THE SEAM NUMBER THE SDK SPEAKS, read from the one place that states it: SEAM_THIS_SDK_SPEAKS in
 * src/sealedCore/loadSealedCore.ts. The pack (packSealedCore.js) refuses a core of any other seam,
 * and the SDK suite reads the number the same way, so no second copy of it exists.
 */
const fs = require('node:fs');
const path = require('node:path');

/** The number SEAM_THIS_SDK_SPEAKS states in the loader of the SDK at `sdkRoot`. */
function seamTheSdkSpeaksIn(sdkRoot) {
  const loaderFile = path.join(sdkRoot, 'src', 'sealedCore', 'loadSealedCore.ts');
  const statement = /const SEAM_THIS_SDK_SPEAKS = (\d+);/.exec(fs.readFileSync(loaderFile, 'utf8'));
  if (!statement) throw new Error(loaderFile + ' states no SEAM_THIS_SDK_SPEAKS');
  return Number(statement[1]);
}

module.exports = { seamTheSdkSpeaksIn };
