import throwError from '../throwError';

function isPackageVersionCompatible({
  version,
  minVersion,
}: {
  version: string;
  minVersion: string;
}): boolean {
  const coreComparison = compareCoreVersions(version, minVersion);
  if (coreComparison < 0) return false;
  if (coreComparison > 0) return true;

  if (hasPreReleaseTags(version, minVersion)) {
    return comparePreReleaseTags(version, minVersion);
  }

  return true;
}

export default isPackageVersionCompatible;

/* ========================================================================== */

/**
 * Compares two semver core versions (major.minor.patch).
 * Ignores pre-release tags and build metadata.
 * @returns -1 if version < minVersion, 0 if equal, 1 if version > minVersion
 */
function compareCoreVersions(version: string, minVersion: string): number {
  const versionParts = parseCoreVersion(version);
  const minVersionParts = parseCoreVersion(minVersion);

  for (let i = 0; i < 3; i++) {
    if (versionParts[i] > minVersionParts[i]) return 1;
    if (versionParts[i] < minVersionParts[i]) return -1;
  }

  return 0;
}

/**
 * Extracts and validates the core version (major.minor.patch) from a semver string.
 * Strips pre-release tags (after "-") and build metadata (after "+").
 * @returns Array of [major, minor, patch] numbers
 */
function parseCoreVersion(version: string): number[] {
  const separatorRegex = /-|\+/;
  const coreVersionString = version.split(separatorRegex)[0];
  const parts = coreVersionString.split('.').map(Number);

  if (parts.length !== 3 || parts.some(isNaN)) {
    throwError({
      type: 'unexpected',
      error: new Error(
        `Invalid version format: "${version}". Core version numbers (major.minor.patch) must contain exactly 3 numbers`
      ),
    });
  }

  return parts;
}

/**
 * Checks if either version contains a pre-release tag (indicated by "-").
 */
function hasPreReleaseTags(version: string, minVersion: string): boolean {
  return version.includes('-') || minVersion.includes('-');
}

/**
 * Compares pre-release tags when core versions are equal.
 * Stable versions (no tag) are considered greater than pre-release versions.
 * When both have tags, compares lexicographically (alpha < beta < rc).
 */
function comparePreReleaseTags(version: string, minVersion: string): boolean {
  const versionPreRelease = extractPreReleaseTag(version);
  const minVersionPreRelease = extractPreReleaseTag(minVersion);

  if (versionPreRelease !== null && minVersionPreRelease === null) {
    return false;
  }
  if (versionPreRelease === null && minVersionPreRelease !== null) {
    return true;
  }

  return versionPreRelease! >= minVersionPreRelease!;
}

/**
 * Extracts the pre-release tag from a semver string.
 * Returns the part between "-" and "+" (or end of string).
 * @example "1.5.0-alpha.1+build.123" → "alpha.1"
 * @returns Pre-release tag string or null if not present
 */
function extractPreReleaseTag(version: string): string | null {
  const dashIndex = version.indexOf('-');
  if (dashIndex === -1) return null;

  const plusIndex = version.indexOf('+', dashIndex);
  return plusIndex === -1
    ? version.substring(dashIndex + 1)
    : version.substring(dashIndex + 1, plusIndex);
}
