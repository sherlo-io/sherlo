import throwError from '../throwError';

function isPackageVersionCompatible({
  version,
  minVersion,
}: {
  version: string;
  minVersion: string;
}): boolean {
  const versionParts = version.split('.').map(Number);
  const minParts = minVersion.split('.').map(Number);

  if (
    versionParts.length !== 3 ||
    minParts.length !== 3 ||
    versionParts.some(isNaN) ||
    minParts.some(isNaN)
  ) {
    throwError({
      type: 'unexpected',
      message: 'Package versions must contain exactly 3 numbers',
    });
  }

  for (let i = 0; i < 3; i++) {
    if (versionParts[i] > minParts[i]) return true;
    if (versionParts[i] < minParts[i]) return false;
  }

  return true; // Versions are equal
}

export default isPackageVersionCompatible;
