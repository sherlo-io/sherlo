import fs from 'fs';
import path from 'path';
import {
  DOCS_LINK,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  PROFILE_OPTION,
  PROJECT_ROOT_OPTION,
} from '../../../constants';
import { getEnhancedError, throwError } from '../../../helpers';
import { CommandParams } from '../../../types';
import { THIS_COMMAND } from '../constants';

const EAS_BUILD_ON_COMPLETE_SCRIPT_NAME = 'eas-build-on-complete';
const EAS_BUILD_SCRIPT_NAME_FLAG = `--${EAS_BUILD_SCRIPT_NAME_OPTION}`;
const PACKAGE_JSON_FILE_NAME = 'package.json';

type ScriptType = 'easBuildOnComplete' | 'easBuildScriptName';

function validatePackageJsonScripts(commandParams: CommandParams<THIS_COMMAND>) {
  const packageJson = getPackageJson(commandParams.projectRoot);

  validateRequiredScript(packageJson, {
    scriptName: EAS_BUILD_ON_COMPLETE_SCRIPT_NAME,
    projectRoot: commandParams.projectRoot,
    type: 'easBuildOnComplete',
  });

  if (commandParams.easBuildScriptName) {
    validateRequiredScript(packageJson, {
      scriptName: commandParams.easBuildScriptName,
      projectRoot: commandParams.projectRoot,
      type: 'easBuildScriptName',
    });
  }
}

function getPackageJson(projectRoot: string) {
  const packageJsonPath = path.resolve(projectRoot, PACKAGE_JSON_FILE_NAME);

  if (!fs.existsSync(packageJsonPath)) {
    throwError({
      message:
        `File ${PACKAGE_JSON_FILE_NAME} not found at location "${packageJsonPath}"` +
        '\n\n' +
        'Please:' +
        `\n1. Make sure the ${PACKAGE_JSON_FILE_NAME} file exists in your project root` +
        `\n2. If your project root is different, use the \`--${PROJECT_ROOT_OPTION}\` option`,
    });
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getEnhancedError(`Invalid ${packageJsonPath}`, error),
    });
  }

  return packageJson;
}

function validateRequiredScript(
  packageJson: any,
  {
    scriptName,
    projectRoot,
    type,
  }: {
    scriptName: string;
    projectRoot: string;
    type: ScriptType;
  }
) {
  const packageJsonPath = path.resolve(projectRoot, PACKAGE_JSON_FILE_NAME);

  if (!packageJson.scripts?.[scriptName]) {
    throwError({
      message:
        type === 'easBuildScriptName'
          ? getEasBuildScriptError(scriptName, packageJsonPath)
          : getEasBuildOnCompleteError(packageJsonPath),
      learnMoreLink: DOCS_LINK.commandExpoCloudBuilds,
    });
  }
}

function getEasBuildOnCompleteError(packageJsonPath: string): string {
  return (
    `Required script "${EAS_BUILD_ON_COMPLETE_SCRIPT_NAME}" is not defined in ${PACKAGE_JSON_FILE_NAME}\n\n` +
    'Please:\n' +
    `1. Make sure you're in the correct project directory (current: "${packageJsonPath}")\n` +
    `2. If not, specify the correct path using \`--${PROJECT_ROOT_OPTION}\` option\n` +
    '3. Add the following script to your package.json:\n\n' +
    `"${EAS_BUILD_ON_COMPLETE_SCRIPT_NAME}": "sherlo ${EAS_BUILD_ON_COMPLETE_COMMAND} --${PROFILE_OPTION} <your-eas-profile>"\n`
  );
}

function getEasBuildScriptError(scriptName: string, packageJsonPath: string): string {
  return (
    `Script "${scriptName}" specified by \`${EAS_BUILD_SCRIPT_NAME_FLAG}\` is not defined in ${PACKAGE_JSON_FILE_NAME}\n\n` +
    'Please:\n' +
    `1. Make sure you're in the correct project directory (current: "${packageJsonPath}")\n` +
    `2. If not, specify the correct path using \`--${PROJECT_ROOT_OPTION}\` option\n` +
    `3. Make sure the script name passed to \`${EAS_BUILD_SCRIPT_NAME_FLAG}\` is correct\n` +
    `4. Add the specified script to your ${PACKAGE_JSON_FILE_NAME} if it doesn't exist\n`
  );
}

export default validatePackageJsonScripts;
