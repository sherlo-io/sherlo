function getPackageVersion(packageName: string): string | null {
  try {
    const pkgPath = require.resolve(`${packageName}/package.json`);

    return require(pkgPath).version;
  } catch {
    return null;
  }
}

export default getPackageVersion;
