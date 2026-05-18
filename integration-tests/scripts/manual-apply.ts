import { materializeApp } from '../harness/materialize.js';
import type { SbVersion } from '../harness/sb-version.js';

const VALID_SB_VERSIONS = ['sb8', 'sb9', 'sb10'] as const;

const sbVersion = process.argv[2];
const variantName = process.argv[3];

if (!sbVersion || !(VALID_SB_VERSIONS as readonly string[]).includes(sbVersion)) {
  console.error(`Usage: yarn manual-apply <sbVersion> [variantName]`);
  console.error(`  sbVersion must be one of: ${VALID_SB_VERSIONS.join(', ')}`);
  process.exit(1);
}

const materializedPath = materializeApp(sbVersion as SbVersion, variantName);

console.log(`\nMaterialized at ${materializedPath}`);
console.log(`Next: cd ${materializedPath} && yarn android`);
