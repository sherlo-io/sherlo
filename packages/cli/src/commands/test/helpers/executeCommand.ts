import chalk from 'chalk';
import {
  ANDROID_OPTION,
  IOS_OPTION,
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
  TEST_STANDARD_COMMAND,
  TOKEN_OPTION,
} from '../../../constants';
import { logInfo, wrapInBox } from '../../../helpers';
import { Options } from '../../../types';
import testEasCloudBuild from '../../testEasCloudBuild';
import testEasUpdate from '../../testEasUpdate';
import testStandard from '../../testStandard';

async function executeCommand(
  command: string,
  options: Record<string, string | boolean>
): Promise<void> {
  // Filter out android/ios options for test:eas-cloud-build command
  let filteredOptions = options;
  if (command === TEST_EAS_CLOUD_BUILD_COMMAND) {
    filteredOptions = { ...options };
    delete filteredOptions[ANDROID_OPTION];
    delete filteredOptions[IOS_OPTION];
  }

  // Create a copy of filtered options with masked token for display
  const displayOptions = { ...filteredOptions };
  if (displayOptions[TOKEN_OPTION]) {
    displayOptions[TOKEN_OPTION] = '***';
  }

  const args = [command];
  Object.entries(displayOptions).forEach(([key, value]) => {
    if (typeof value === 'boolean') {
      if (value) {
        args.push(`--${key}`);
      }
    } else if (value) {
      args.push(`--${key}`, String(value));
    }
  });

  console.log();

  console.log(
    wrapInBox({
      title: 'Executed Command 🚀',
      text: chalk.cyan(`npx sherlo ${args.join(' ')}`),
      type: 'command',
    })
  );

  logInfo({
    message: 'You can run this command directly next time to skip the interactive prompts',
  });

  console.log();

  switch (command) {
    case TEST_STANDARD_COMMAND:
      await testStandard(filteredOptions as Options<typeof TEST_STANDARD_COMMAND>);

      break;
    case TEST_EAS_UPDATE_COMMAND:
      await testEasUpdate(filteredOptions as Options<typeof TEST_EAS_UPDATE_COMMAND>);

      break;
    case TEST_EAS_CLOUD_BUILD_COMMAND:
      await testEasCloudBuild(filteredOptions as Options<typeof TEST_EAS_CLOUD_BUILD_COMMAND>);

      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export default executeCommand;
