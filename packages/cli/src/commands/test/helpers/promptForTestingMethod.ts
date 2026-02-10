import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  DOCS_LINK,
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
  TEST_STANDARD_COMMAND,
} from '../../../constants';
import { printLink, throwError } from '../../../helpers';

async function promptForTestingMethod(): Promise<string> {
  let testingMethod;
  try {
    testingMethod = await select({
      message: 'Choose testing method:',
      choices: [
        {
          name: `Standard ${chalk.reset('- test app builds with')} ${chalk.blue('bundled JavaScript')}`,
          short: 'Standard',
          description: getLearnMoreLink(TEST_STANDARD_COMMAND),
          value: TEST_STANDARD_COMMAND,
        },
        {
          name: `EAS Update ${chalk.reset('- test builds with')} ${chalk.blue('OTA JavaScript updates')} ${chalk.reset('- skip rebuilds')}`,
          short: 'EAS Update',
          description: getLearnMoreLink(TEST_EAS_UPDATE_COMMAND),
          value: TEST_EAS_UPDATE_COMMAND,
        },
        {
          name: `EAS Cloud Build ${chalk.reset('- automatically test builds created on')} ${chalk.blue('Expo servers')}`,
          short: 'EAS Cloud Build',
          description: getLearnMoreLink(TEST_EAS_CLOUD_BUILD_COMMAND),
          value: TEST_EAS_CLOUD_BUILD_COMMAND,
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
  | typeof TEST_STANDARD_COMMAND
  | typeof TEST_EAS_UPDATE_COMMAND
  | typeof TEST_EAS_CLOUD_BUILD_COMMAND;

function getLearnMoreLink(testingCommand: TestingCommand): string {
  const docsLink = {
    [TEST_STANDARD_COMMAND]: DOCS_LINK.testStandard,
    [TEST_EAS_UPDATE_COMMAND]: DOCS_LINK.testEasUpdate,
    [TEST_EAS_CLOUD_BUILD_COMMAND]: DOCS_LINK.testEasCloudBuild,
  };

  return chalk.reset.dim(`↳ Learn more: ${printLink(docsLink[testingCommand])}`);
}
