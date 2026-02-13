import {
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
  TEST_STANDARD_COMMAND,
} from '../../constants';

export type TestMethodCommand =
  | typeof TEST_STANDARD_COMMAND
  | typeof TEST_EAS_UPDATE_COMMAND
  | typeof TEST_EAS_CLOUD_BUILD_COMMAND;
