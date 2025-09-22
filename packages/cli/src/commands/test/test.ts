import {
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
  TEST_STANDARD_COMMAND,
} from '../../constants';
import { printSherloIntro } from '../../helpers';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';
import {
  checkSherloInitialization,
  collectMissingOptions,
  collectTestEasCloudBuildOptions,
  collectTestEasUpdateOptions,
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
  process.env.SKIP_INTRO = 'true';

  // Step 2: Ask user to select testing method
  const selectedCommand = await promptForTestingMethod();

  // Step 3: Check for missing required options and prompt user
  const missingOptions = await collectMissingOptions(selectedCommand, passedOptions);

  // Step 4: Collect command-specific options
  let commandOptions: Record<string, string | boolean> = {};
  switch (selectedCommand) {
    case TEST_STANDARD_COMMAND:
      break;
    case TEST_EAS_UPDATE_COMMAND:
      commandOptions = await collectTestEasUpdateOptions();
      break;
    case TEST_EAS_CLOUD_BUILD_COMMAND:
      commandOptions = await collectTestEasCloudBuildOptions(passedOptions);
      break;
  }

  // Step 5: Execute the selected command
  const finalOptions = { ...passedOptions, ...missingOptions, ...commandOptions };
  await executeCommand(selectedCommand, finalOptions);
}

export default test;
