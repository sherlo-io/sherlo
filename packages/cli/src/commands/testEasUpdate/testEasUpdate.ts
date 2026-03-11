import {
  getValidatedCommandParams,
  printSherloIntro,
  uploadOrReuseBuildsAndRunTests,
  validateLocalBinaries,
} from '../../helpers';
import { EasUpdateData, Options } from '../../types';
import { EAS_ANDROID_URL_OPTION, EAS_IOS_URL_OPTION, EAS_UPDATE_SLUG_OPTION } from '../../constants';
import { THIS_COMMAND } from './constants';
import { getValidatedEasUpdateData } from './helpers';

async function testEasUpdate(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  printSherloIntro();

  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: true }
  );

  // Validate local binaries before expensive EAS operations (expo config + eas-cli)
  // Catches wrong build type, missing Sherlo, outdated SDK, missing expo-dev-client early
  await validateLocalBinaries({ commandParams, command: THIS_COMMAND });

  const easAndroidUrl = passedOptions[EAS_ANDROID_URL_OPTION];
  const easIosUrl = passedOptions[EAS_IOS_URL_OPTION];
  const hasDevtoolsBypass =
    process.env.SHERLO_DEVTOOLS === '1' && easAndroidUrl && easIosUrl;

  const easUpdateData: EasUpdateData = hasDevtoolsBypass
    ? {
        branch: commandParams.branch,
        message: '',
        updateUrls: { android: easAndroidUrl, ios: easIosUrl },
        slug: passedOptions[EAS_UPDATE_SLUG_OPTION] ?? '',
      }
    : await getValidatedEasUpdateData(commandParams);

  return uploadOrReuseBuildsAndRunTests({ commandParams, easUpdateData });
}

export default testEasUpdate;
