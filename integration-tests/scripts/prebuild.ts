import { buildNativeApp, bundleAndSplice } from '../harness/app-builder.js';
import { ALL_ALL_SB_VERSIONS, type SbVersion } from '../harness/sb-version.js';

const appName = process.argv[2];
const sbVersionArg = process.argv[3] as SbVersion | undefined;

if (!appName) {
  console.error('Usage: yarn prebuild <appName> [sbVersion]');
  console.error(`  sbVersion: one of ${ALL_SB_VERSIONS.join(', ')} (optional; omit to build native shell only)`);
  process.exit(1);
}

if (sbVersionArg && !(ALL_SB_VERSIONS as readonly string[]).includes(sbVersionArg)) {
  console.error(`Invalid sbVersion '${sbVersionArg}'. Must be one of: ${ALL_SB_VERSIONS.join(', ')}`);
  process.exit(1);
}

console.log(`Prebuild: appName=${appName}` + (sbVersionArg ? `, sbVersion=${sbVersionArg}` : ' (native only)'));

const nativeApkPath = buildNativeApp(appName);
console.log(`Native APK: ${nativeApkPath}`);

if (sbVersionArg) {
  const { apkPath, cacheHit } = bundleAndSplice({ appName, sbVersion: sbVersionArg, nativeApkPath });
  console.log(`Spliced APK (${sbVersionArg}): ${apkPath}${cacheHit ? ' [cache hit]' : ''}`);
}

console.log('Prebuild done.');
