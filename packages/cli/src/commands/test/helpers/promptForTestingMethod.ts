import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  DOCS_LINK,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATE_COMMAND,
  LOCAL_BUILDS_COMMAND,
} from '../../../constants';
import { printLink, throwError } from '../../../helpers';

async function promptForTestingMethod(): Promise<string> {
  let testingMethod;
  try {
    testingMethod = await select({
      message: 'Choose testing method:',
      choices: [
        {
          name: `Local Builds${chalk.reset(' - test standard builds')}`,
          short: 'Local Builds',
          description: getLearnMoreLink(LOCAL_BUILDS_COMMAND),
          value: LOCAL_BUILDS_COMMAND,
        },
        {
          name: `Expo Update${chalk.reset(' - test builds with dynamic JavaScript (OTA) updates')}`,
          short: 'Expo Update',
          description: getLearnMoreLink(EXPO_UPDATE_COMMAND),
          value: EXPO_UPDATE_COMMAND,
        },
        {
          name: `Expo Cloud Builds${chalk.reset(' - test cloud builds created by Expo')}`,
          short: 'Expo Cloud Builds',
          description: getLearnMoreLink(EXPO_CLOUD_BUILDS_COMMAND),
          value: EXPO_CLOUD_BUILDS_COMMAND,
        },
      ],
    });
  } catch (error: any) {
    console.log();

    if (error.name === 'ExitPromptError') {
      throwError({ message: 'No testing method selected' });
    }

    throw error;
  }

  console.log(getLearnMoreLink(testingMethod as TestingCommand));

  return testingMethod;
}

export default promptForTestingMethod;

/* ========================================================================== */

type TestingCommand =
  | typeof LOCAL_BUILDS_COMMAND
  | typeof EXPO_UPDATE_COMMAND
  | typeof EXPO_CLOUD_BUILDS_COMMAND;

function getLearnMoreLink(testingCommand: TestingCommand): string {
  const docsLink = {
    [LOCAL_BUILDS_COMMAND]: DOCS_LINK.commandLocalBuilds,
    [EXPO_UPDATE_COMMAND]: DOCS_LINK.commandExpoUpdate,
    [EXPO_CLOUD_BUILDS_COMMAND]: DOCS_LINK.commandExpoCloudBuilds,
  };

  return chalk.reset.dim(`↳ Learn more: ${printLink(docsLink[testingCommand])}`);
}
