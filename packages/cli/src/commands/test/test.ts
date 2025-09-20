import {
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATE_COMMAND,
  LOCAL_BUILDS_COMMAND,
} from '../../constants';
import { printSherloIntro } from '../../helpers';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';
import {
  checkSherloInitialization,
  collectExpoCloudBuildsOptions,
  collectExpoUpdateOptions,
  collectMissingOptions,
  executeCommand,
  promptForTestingMethod,
} from './helpers';

async function test(passedOptions: Options<typeof THIS_COMMAND>): Promise<void> {
  printSherloIntro();

  // Step 1: Check if Sherlo is initialized
  await checkSherloInitialization({
    projectRoot: passedOptions.projectRoot,
    config: passedOptions.config,
  });

  // Set flag to prevent duplicate intro printing in sub-commands
  process.env.INTRO_ALREADY_PRINTED = 'true';

  // Step 2: Ask user to select testing method
  const selectedCommand = await promptForTestingMethod();

  // Step 3: Check for missing required options and prompt user
  const missingOptions = await collectMissingOptions(selectedCommand, passedOptions);

  // Step 4: Collect command-specific options
  let commandOptions: Record<string, string | boolean> = {};
  switch (selectedCommand) {
    case LOCAL_BUILDS_COMMAND:
      break;
    case EXPO_UPDATE_COMMAND:
      commandOptions = await collectExpoUpdateOptions();
      break;
    case EXPO_CLOUD_BUILDS_COMMAND:
      commandOptions = await collectExpoCloudBuildsOptions(passedOptions);
      break;
  }

  // Step 5: Execute the selected command
  const finalOptions = { ...passedOptions, ...missingOptions, ...commandOptions };
  await executeCommand(selectedCommand, finalOptions);
}

export default test;
