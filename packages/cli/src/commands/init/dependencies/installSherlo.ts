import chalk from 'chalk';
import { readFile } from 'fs/promises';
import ora from 'ora';
import { detect, resolveCommand } from 'package-manager-detector';
import { join } from 'path';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';
import { getCwd, getEnhancedError, runShellCommand, throwError } from '../../../helpers';
import { trackProgress } from '../helpers';
import { EVENT } from './constants';

async function installSherlo(sessionId: string): Promise<void> {
  const spinner = ora('Installing Sherlo').start();

  const event = `${EVENT}:installSherlo`;

  let packageJson;
  const packageJsonPath = join(getCwd(), 'package.json');
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
  } catch (error) {
    spinner.fail();

    console.log();

    throwError({
      type: 'unexpected',
      error: getEnhancedError(`Invalid ${packageJsonPath}`, error),
    });
  }

  const isSherloAlreadyInDependencies =
    !!packageJson.dependencies[SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME];

  const packageManager = (await detect())?.name ?? 'npm';
  const resolvedCommand = resolveCommand(
    packageManager,
    'add',
    [
      isSherloAlreadyInDependencies ? null : '-D',
      SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME,
    ].filter(Boolean) as string[]
  );

  if (!resolvedCommand) {
    spinner.fail();

    console.log();

    throwError({
      type: 'unexpected',
      error: new Error(`Failed to resolve command for package manager: ${packageManager}`),
    });
  }

  const { command, args } = resolvedCommand;
  const commandToRun = `${command} ${args.join(' ')}`;

  try {
    await runShellCommand({
      command: commandToRun,
      projectRoot: getCwd(),
    });
  } catch {
    spinner.fail();

    console.log();

    await trackProgress({
      event,
      params: { status: 'failed:command_error' },
      sessionId,
    });

    throwError({
      message:
        'Failed to install Sherlo automatically\n' +
        '\n' +
        chalk.reset('Please install it manually:\n') +
        chalk.cyan('  ' + commandToRun),
    });
  }

  spinner.succeed('Installed Sherlo');

  await trackProgress({
    event,
    params: { status: 'success' },
    sessionId,
  });
}

export default installSherlo;
