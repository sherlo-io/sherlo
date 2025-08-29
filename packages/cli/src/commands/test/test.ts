import chalk from 'chalk';
import prompts from 'prompts';
import {
  BRANCH_OPTION,
  DOCS_LINK,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATE_COMMAND,
  LOCAL_BUILDS_COMMAND,
  WAIT_FOR_EAS_BUILD_OPTION,
} from '../../constants';
import { printSherloIntro } from '../../helpers';
import printLink from '../../helpers/printLink';
import { Options } from '../../types';
import { expoCloudBuilds, expoUpdate, localBuilds } from '../index';
import { THIS_COMMAND } from './constants';

async function test(passedOptions: Options<typeof THIS_COMMAND>): Promise<void> {
  printSherloIntro();

  // Set flag to prevent duplicate intro printing
  process.env.INTRO_ALREADY_PRINTED = 'true';

  const selectedCommand = await promptForTestingMethod();

  // Collect additional options based on selected command
  let commandOptions: Record<string, string | boolean> = {};
  switch (selectedCommand) {
    case LOCAL_BUILDS_COMMAND:
      break;
    case EXPO_CLOUD_BUILDS_COMMAND:
      commandOptions = await collectExpoCloudBuildsOptions();
      break;
    case EXPO_UPDATE_COMMAND:
      commandOptions = await collectExpoUpdateOptions();
      break;
  }

  const finalOptions = { ...passedOptions, ...commandOptions };

  await executeCommand(selectedCommand, finalOptions);
}

export default test;

/* ========================================================================== */

const SELECT_HINT = 'Use arrow-keys, Enter to select';

async function promptForTestingMethod(): Promise<string> {
  const response = await prompts({
    type: 'select',
    name: 'method',
    message: 'Choose testing method:',
    choices: [
      {
        title: `Local Builds${chalk.reset(' ')}${chalk.dim('(standard method)')}`,
        value: LOCAL_BUILDS_COMMAND,
      },
      {
        title: `Expo Cloud Builds${chalk.reset(' ')}${chalk.dim(
          '(test builds after building on Expo servers via EAS Build)'
        )}`,
        value: EXPO_CLOUD_BUILDS_COMMAND,
      },
      {
        title: `Expo Update${chalk.reset(' ')}${chalk.dim('(test OTA updates via EAS Update)')}`,
        value: EXPO_UPDATE_COMMAND,
      },
    ],
    hint: SELECT_HINT,
  });

  if (response.method) {
    let docsLink = DOCS_LINK.commandLocalBuilds;
    if (response.method === EXPO_CLOUD_BUILDS_COMMAND) {
      docsLink = DOCS_LINK.commandExpoCloudBuilds;
    } else if (response.method === EXPO_UPDATE_COMMAND) {
      docsLink = DOCS_LINK.commandExpoUpdate;
    }

    console.log(chalk.dim(`↳ Learn more: ${printLink(docsLink)}`));

    return response.method;
  } else {
    process.exit(1);
  }
}

async function collectExpoCloudBuildsOptions(): Promise<Record<string, string | boolean>> {
  console.log(chalk.yellow('\nExpo Cloud Builds configuration:'));

  const methodResponse = await prompts({
    type: 'select',
    name: 'method',
    message: 'Choose EAS Build method:',
    choices: [
      {
        title: `Provide EAS Build script name${chalk.reset(' ')}${chalk.dim(
          `(--${EAS_BUILD_SCRIPT_NAME_OPTION})`
        )}`,
        value: 'script',
      },
      {
        title: `Wait for manual trigger${chalk.reset(' ')}${chalk.dim(
          `(--${WAIT_FOR_EAS_BUILD_OPTION})`
        )}`,
        value: 'wait',
      },
    ],
    hint: SELECT_HINT,
  });

  if (!methodResponse.method) {
    process.exit(1);
  }

  if (methodResponse.method === 'script') {
    const scriptResponse = await prompts({
      type: 'text',
      name: 'scriptName',
      message: `Enter EAS Build script name${chalk.reset(' ')}${chalk.dim(
        `(--${EAS_BUILD_SCRIPT_NAME_OPTION})`
      )}:`,
      validate: (value: string) => (value.length > 0 ? true : 'Script name is required'),
    });

    if (scriptResponse.scriptName) {
      return { [EAS_BUILD_SCRIPT_NAME_OPTION]: scriptResponse.scriptName };
    } else {
      process.exit(1);
    }
  } else {
    return { [WAIT_FOR_EAS_BUILD_OPTION]: true };
  }
}

async function collectExpoUpdateOptions(): Promise<Record<string, string | boolean>> {
  console.log(chalk.yellow('\nExpo Update requires additional configuration:'));

  const response = await prompts({
    type: 'text',
    name: 'branch',
    message: `Enter EAS Update branch name${chalk.reset(' ')}${chalk.dim(`(--${BRANCH_OPTION})`)}:`,
    validate: (value: string) => (value.length > 0 ? true : 'Branch name is required'),
  });

  if (response.branch) {
    return { [BRANCH_OPTION]: response.branch };
  } else {
    process.exit(1);
  }
}

async function executeCommand(
  command: string,
  options: Record<string, string | boolean>
): Promise<void> {
  const args = [command];
  Object.entries(options).forEach(([key, value]) => {
    if (typeof value === 'boolean') {
      if (value) {
        args.push(`--${key}`);
      }
    } else if (value) {
      args.push(`--${key}`, String(value));
    }
  });

  console.log(`\n🚀 Executing: ${chalk.blue(`sherlo ${args.join(' ')}`)}\n`);

  switch (command) {
    case LOCAL_BUILDS_COMMAND:
      await localBuilds(options as Options<typeof LOCAL_BUILDS_COMMAND>);
      break;
    case EXPO_CLOUD_BUILDS_COMMAND:
      await expoCloudBuilds(options as Options<typeof EXPO_CLOUD_BUILDS_COMMAND>);
      break;
    case EXPO_UPDATE_COMMAND:
      await expoUpdate(options as Options<typeof EXPO_UPDATE_COMMAND>);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
