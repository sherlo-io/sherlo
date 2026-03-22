import chalk from 'chalk';
import { FULL_INIT_COMMAND, REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { throwError } from '../../../helpers';
import findPackageJsonPaths from './findPackageJsonPaths';
import hasDependency from './hasDependency';

async function validateHasReactNative(): Promise<void> {
  const { current, monorepoRoot } = await findPackageJsonPaths();

  const hasReactNative =
    (await hasDependency(current, REACT_NATIVE_PACKAGE_NAME)) ||
    (await hasDependency(monorepoRoot, REACT_NATIVE_PACKAGE_NAME));

  if (!hasReactNative) {
    throwError({
      message:
        `\`${REACT_NATIVE_PACKAGE_NAME}\` package is not installed\n` +
        '\n' +
        chalk.reset('Please install it using your package manager\n') +
        '\n' +
        chalk.reset('Then re-run:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND}`),
    });
  }
}

export default validateHasReactNative;
