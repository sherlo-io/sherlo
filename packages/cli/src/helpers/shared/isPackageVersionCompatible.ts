import throwError from '../throwError';

function isPackageVersionCompatible({
  version,
  minVersion,
}: {
  version: string;
  minVersion: string;
}): boolean {
  // Handle various semver formats:
  // - Standard: "1.2.3"
  // - Pre-release: "1.2.3-alpha.1", "1.2.3-beta.2", "1.2.3-rc.1"
  // - Build metadata: "1.2.3+build.123"
  // - Combined: "1.2.3-beta.1+build.123"
  // We only compare the core version (1.2.3), ignoring pre-release and build metadata
  const separatorRegex = /-|\+/; // Matches either "-" or "+"
  const cleanVersion = version.split(separatorRegex)[0];
  const cleanMinVersion = minVersion.split(separatorRegex)[0];

  const versionParts = cleanVersion.split('.').map(Number);
  const minParts = cleanMinVersion.split('.').map(Number);

  if (
    versionParts.length !== 3 ||
    versionParts.some(isNaN) ||
    minParts.length !== 3 ||
    minParts.some(isNaN)
  ) {
    const invalidVersion =
      versionParts.length !== 3 || versionParts.some(isNaN) ? version : minVersion;

    throwError({
      type: 'unexpected',
      error: new Error(
        `Invalid version format: "${invalidVersion}". Core version numbers (major.minor.patch) must contain exactly 3 numbers`
      ),
    });
  }

  for (let i = 0; i < 3; i++) {
    if (versionParts[i] > minParts[i]) return true;
    if (versionParts[i] < minParts[i]) return false;
  }

  return true; // Versions are equal
}

export default isPackageVersionCompatible;
