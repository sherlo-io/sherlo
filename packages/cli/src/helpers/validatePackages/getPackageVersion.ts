import { throwError } from '../../helpers';

function getPackageVersion(packageName: string): string | null {
  try {
    const pkgPath = require.resolve(`${packageName}/package.json`);

    return require(pkgPath).version;
  } catch (error) {
    throwError({ type: 'unexpected', error });
  }
}

export default getPackageVersion;
