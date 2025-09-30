import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PROJECT_ROOT,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  WAIT_FOR_EAS_BUILD_OPTION,
} from '../../../constants';
import { throwError } from '../../../helpers';
import { Options } from '../../../types';
import { THIS_COMMAND } from '../constants';

async function collectTestEasCloudBuildOptions(
  passedOptions: Options<typeof THIS_COMMAND>
): Promise<Record<string, string | boolean>> {
  console.log();

  let easBuildMethod;
  try {
    easBuildMethod = await select({
      message: 'Choose EAS Build method:',
      choices: [
        {
          name: `Run package.json script${chalk.reset.dim(` (--${EAS_BUILD_SCRIPT_NAME_OPTION})`)}`,
          short: 'Run package.json script',
          value: 'script',
        },
        {
          name: `Wait for manual trigger${chalk.reset.dim(` (--${WAIT_FOR_EAS_BUILD_OPTION})`)}`,
          value: 'wait',
        },
      ],
    });
  } catch (error: any) {
    console.log();

    if (error.name === 'ExitPromptError') {
      throwError({ message: 'No EAS Build method selected' });
    }

    throw error;
  }

  if (easBuildMethod === 'wait') {
    return { [WAIT_FOR_EAS_BUILD_OPTION]: true };
  } else {
    console.log();

    let easBuildScriptName;
    try {
      easBuildScriptName = await input({
        message: `Enter EAS Build script to run${chalk.reset.dim(
          ` (--${EAS_BUILD_SCRIPT_NAME_OPTION})`
        )}:`,
        validate: (value) => validateScriptName(value, passedOptions.projectRoot),
      });
    } catch (error: any) {
      console.log();

      if (error.name === 'ExitPromptError') {
        throwError({ message: 'No EAS Build script name provided' });
      }

      throw error;
    }

    return { [EAS_BUILD_SCRIPT_NAME_OPTION]: easBuildScriptName };
  }
}

export default collectTestEasCloudBuildOptions;

/* ========================================================================== */

/**
 * Validates if a script exists in package.json
 * Returns true if valid, or error message string if invalid
 */
function validateScriptName(scriptName: string, projectRoot = DEFAULT_PROJECT_ROOT): true | string {
  if (!scriptName || scriptName.length === 0) {
    return 'Script name is required';
  }

  try {
    const packageJsonPath = path.resolve(projectRoot, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return `package.json not found at "${packageJsonPath}". Make sure you're in the correct project directory`;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    if (!packageJson.scripts?.[scriptName]) {
      return `Script "${scriptName}" is not defined in your package.json ${chalk.reset.dim(
        `(${packageJsonPath})`
      )}`;
    }

    return true;
  } catch (error) {
    return `Error reading package.json: ${(error as Error).message}`;
  }
}
