import { REQUIRED_MIN_NATIVE_VERSION, JS_MODULE_VERSION as jsVersion } from './sdk-compatibility.json';
import SherloModule from './SherloModule';

const ERROR_CODE = 'ERROR_SDK_COMPATIBILITY';

// Cached result so sendNativeError is only called once even if checkSdkCompatibility
// is invoked multiple times (e.g., from index.ts early-check and from getStorybook.tsx).
let _cachedResult: boolean | null = null;

function checkSdkCompatibility(): boolean {
  if (_cachedResult !== null) return _cachedResult;

  const requiredMinNativeVersion = REQUIRED_MIN_NATIVE_VERSION;

  const nativeVersion = SherloModule.getNativeVersion();

  if (
    nativeVersion === null ||
    nativeVersion === undefined ||
    !isVersionCompatible(nativeVersion, requiredMinNativeVersion)
  ) {
    const message =
      nativeVersion === null || nativeVersion === undefined
        ? `Sherlo native version is missing. Required minimum: ${requiredMinNativeVersion}. Please rebuild the app.`
        : `Sherlo native version ${nativeVersion} is below the required minimum ${requiredMinNativeVersion}. Please rebuild the app.`;

    SherloModule.sendNativeError(ERROR_CODE, message, { jsVersion, nativeVersion: nativeVersion ?? null });
    _cachedResult = false;
    return false;
  }

  _cachedResult = true;
  return true;
}

export default checkSdkCompatibility;

export function __resetCacheForTests(): void {
  _cachedResult = null;
}

/* ========================================================================== */

function isVersionCompatible(version: string, minVersion: string): boolean {
  // Only compare core X.Y.Z - all pre-release/build suffixes are ignored so that
  // versions like 1.6.3-test.xxx are treated as compatible with min 1.6.3.
  return compareCoreVersions(version, minVersion) >= 0;
}

function compareCoreVersions(version: string, minVersion: string): number {
  const parse = (v: string) =>
    v
      .split(/[-+]/)[0]
      .split('.')
      .map(Number);

  const vParts = parse(version);
  const mParts = parse(minVersion);

  for (let i = 0; i < 3; i++) {
    const vn = vParts[i] ?? 0;
    const mn = mParts[i] ?? 0;
    if (vn > mn) return 1;
    if (vn < mn) return -1;
  }
  return 0;
}
