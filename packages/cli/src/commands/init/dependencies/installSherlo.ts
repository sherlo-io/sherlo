import chalk from 'chalk';
import { readFile } from 'fs/promises';
import ora from 'ora';
import { detect, resolveCommand } from 'package-manager-detector';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';
import { getCwd, runShellCommand, throwError } from '../../../helpers';
import { trackProgress } from '../helpers';
import { EVENT } from './constants';

async function installSherlo(sessionId: string): Promise<void> {
  const spinner = ora('Installing Sherlo').start();

  const event = `${EVENT}:installSherlo`;

  const packageJson = JSON.parse(await readFile('package.json', 'utf-8'));
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
