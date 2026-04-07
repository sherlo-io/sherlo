import { REQUIRED_MIN_NATIVE_VERSION } from './sdk-compatibility.json';
import { version as jsVersion } from '../package.json';
import SherloModule from './SherloModule';

const ERROR_CODE = 'ERROR_SDK_COMPATIBILITY';

async function checkSdkCompatibility(): Promise<void> {
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
    throw new Error(message);
  }
}

export default checkSdkCompatibility;

/* ========================================================================== */

function isVersionCompatible(version: string, minVersion: string): boolean {
  const coreComparison = compareCoreVersions(version, minVersion);
  if (coreComparison < 0) return false;
  if (coreComparison > 0) return true;

  // Core versions are equal; handle pre-release tags
  const versionPreRelease = extractPreReleaseTag(version);
  const minVersionPreRelease = extractPreReleaseTag(minVersion);

  // A pre-release version is considered lower than the stable release
  if (versionPreRelease !== null && minVersionPreRelease === null) return false;
  if (versionPreRelease === null && minVersionPreRelease !== null) return true;

  return (versionPreRelease ?? '') >= (minVersionPreRelease ?? '');
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

function extractPreReleaseTag(version: string): string | null {
  const dashIndex = version.indexOf('-');
  if (dashIndex === -1) return null;
  const plusIndex = version.indexOf('+', dashIndex);
  return plusIndex === -1
    ? version.substring(dashIndex + 1)
    : version.substring(dashIndex + 1, plusIndex);
}
