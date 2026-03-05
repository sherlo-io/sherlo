import { Command, CommandParams } from '../types';
import getPlatformsToTest from './getPlatformsToTest';
import getLocalBinariesInfo from './getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo';
import validateBinariesInfo from './getValidatedBinariesInfoAndNextBuildIndex/validateBinariesInfo';

/**
 * Validates local binary files (build type, Sherlo SDK, expo-dev-client, etc.)
 * before any network/subprocess calls. Call this early to fail fast on build
 * issues without wasting time on API calls or expo/eas-cli commands.
 */
async function validateLocalBinaries({
  commandParams,
  command,
}: {
  commandParams: CommandParams;
  command: Command;
}) {
  const platforms = getPlatformsToTest(commandParams.devices);

  const localBinariesInfo = await getLocalBinariesInfo({
    paths: { android: commandParams.android, ios: commandParams.ios },
    platforms,
    projectRoot: commandParams.projectRoot,
    command,
  });

  validateBinariesInfo({
    binariesInfo: {
      android: localBinariesInfo.android
        ? { ...localBinariesInfo.android, s3Key: '' }
        : undefined,
      ios: localBinariesInfo.ios ? { ...localBinariesInfo.ios, s3Key: '' } : undefined,
    },
    command,
  });
}

export default validateLocalBinaries;
