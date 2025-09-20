import chalk from 'chalk';
import {
  ANDROID_OPTION,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATE_COMMAND,
  IOS_OPTION,
  LOCAL_BUILDS_COMMAND,
  TOKEN_OPTION,
} from '../../../constants';
import { logInfo, wrapInBox } from '../../../helpers';
import { Options } from '../../../types';
import expoCloudBuilds from '../../expoCloudBuilds';
import expoUpdate from '../../expoUpdate';
import localBuilds from '../../localBuilds';

async function executeCommand(
  command: string,
  options: Record<string, string | boolean>
): Promise<void> {
  // Filter out android/ios options for expo cloud builds command
  let filteredOptions = options;
  if (command === EXPO_CLOUD_BUILDS_COMMAND) {
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
    case LOCAL_BUILDS_COMMAND:
      await localBuilds(filteredOptions as Options<typeof LOCAL_BUILDS_COMMAND>);

      break;
    case EXPO_CLOUD_BUILDS_COMMAND:
      await expoCloudBuilds(filteredOptions as Options<typeof EXPO_CLOUD_BUILDS_COMMAND>);

      break;
    case EXPO_UPDATE_COMMAND:
      await expoUpdate(filteredOptions as Options<typeof EXPO_UPDATE_COMMAND>);

      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export default executeCommand;
