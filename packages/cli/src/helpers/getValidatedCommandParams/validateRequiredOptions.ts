import { Command, Options } from '../../types';
import {
  BRANCH_OPTION,
  DOCS_LINK,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATE_COMMAND,
  WAIT_FOR_EAS_BUILD_OPTION,
} from '../../constants';
import throwError from '../throwError';

function validateRequiredOptions({
  command,
  passedOptions,
}: {
  command: Command;
  passedOptions: Options<any>;
}): void {
  switch (command) {
    case EXPO_CLOUD_BUILDS_COMMAND:
      validateExpoCloudBuildsOptions(passedOptions);
      break;

    case EXPO_UPDATE_COMMAND:
      validateExpoUpdateOptions(passedOptions);
      break;
  }
}

export default validateRequiredOptions;

/* ========================================================================== */

const BRANCH_FLAG = `--${BRANCH_OPTION}`;
const EAS_BUILD_SCRIPT_NAME_FLAG = `--${EAS_BUILD_SCRIPT_NAME_OPTION}`;
const WAIT_FOR_EAS_BUILD_FLAG = `--${WAIT_FOR_EAS_BUILD_OPTION}`;

function validateExpoCloudBuildsOptions(options: Options<any>): void {
  const hasScriptNameFlag = options[EAS_BUILD_SCRIPT_NAME_OPTION];
  const hasWaitFlag = options[WAIT_FOR_EAS_BUILD_OPTION];

  if (!hasScriptNameFlag && !hasWaitFlag) {
    throwError({
      message: `\`sherlo ${EXPO_CLOUD_BUILDS_COMMAND}\` command requires either \`${EAS_BUILD_SCRIPT_NAME_FLAG}\` or \`${WAIT_FOR_EAS_BUILD_FLAG}\` option`,
      learnMoreLink: DOCS_LINK.commandExpoCloudBuilds,
    });
  }

  if (hasScriptNameFlag && hasWaitFlag) {
    throwError({
      message: `\`sherlo ${EXPO_CLOUD_BUILDS_COMMAND}\` command cannot use \`${EAS_BUILD_SCRIPT_NAME_FLAG}\` and \`${WAIT_FOR_EAS_BUILD_FLAG}\` options together`,
      learnMoreLink: DOCS_LINK.commandExpoCloudBuilds,
    });
  }
}

function validateExpoUpdateOptions(options: Options<any>): void {
  if (!options[BRANCH_OPTION]) {
    throwError({
      message: `\`sherlo ${EXPO_UPDATE_COMMAND}\` command requires \`${BRANCH_FLAG}\` option`,
      learnMoreLink: DOCS_LINK.commandExpoUpdate,
    });
  }
}
