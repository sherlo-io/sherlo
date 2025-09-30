import {
  BRANCH_OPTION,
  DOCS_LINK,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
  WAIT_FOR_EAS_BUILD_OPTION,
} from '../../constants';
import { Command, Options } from '../../types';
import throwError from '../throwError';

function validateRequiredOptions({
  command,
  passedOptions,
}: {
  command: Command;
  passedOptions: Options<any>;
}): void {
  switch (command) {
    case TEST_EAS_CLOUD_BUILD_COMMAND:
      validateTestEasCloudBuildOptions(passedOptions);
      break;

    case TEST_EAS_UPDATE_COMMAND:
      validateTestEasUpdateOptions(passedOptions);
      break;
  }
}

export default validateRequiredOptions;

/* ========================================================================== */

const BRANCH_FLAG = `--${BRANCH_OPTION}`;
const EAS_BUILD_SCRIPT_NAME_FLAG = `--${EAS_BUILD_SCRIPT_NAME_OPTION}`;
const WAIT_FOR_EAS_BUILD_FLAG = `--${WAIT_FOR_EAS_BUILD_OPTION}`;

function validateTestEasCloudBuildOptions(options: Options<any>): void {
  const hasScriptNameFlag = options[EAS_BUILD_SCRIPT_NAME_OPTION];
  const hasWaitFlag = options[WAIT_FOR_EAS_BUILD_OPTION];

  if (!hasScriptNameFlag && !hasWaitFlag) {
    throwError({
      message: `\`sherlo ${TEST_EAS_CLOUD_BUILD_COMMAND}\` command requires either \`${EAS_BUILD_SCRIPT_NAME_FLAG}\` or \`${WAIT_FOR_EAS_BUILD_FLAG}\` option`,
      learnMoreLink: DOCS_LINK.testEasCloudBuild,
    });
  }

  if (hasScriptNameFlag && hasWaitFlag) {
    throwError({
      message: `\`sherlo ${TEST_EAS_CLOUD_BUILD_COMMAND}\` command cannot use \`${EAS_BUILD_SCRIPT_NAME_FLAG}\` and \`${WAIT_FOR_EAS_BUILD_FLAG}\` options together`,
      learnMoreLink: DOCS_LINK.testEasCloudBuild,
    });
  }
}

function validateTestEasUpdateOptions(options: Options<any>): void {
  if (!options[BRANCH_OPTION]) {
    throwError({
      message: `\`sherlo ${TEST_EAS_UPDATE_COMMAND}\` command requires \`${BRANCH_FLAG}\` option`,
      learnMoreLink: DOCS_LINK.testEasUpdate,
    });
  }
}
