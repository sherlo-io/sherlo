import { Build } from '@sherlo/api-types';
import fs from 'fs';
import path from 'path';
import {
  getConfig,
  getGitInfo,
  getOptionsWithDefaults,
  printHeader,
  validateConfig,
  throwError,
  uploadBuildsAndRunTests,
  getPlatformsToTest,
} from '../../helpers';
import { OptionDefaults } from '../../types';
import { DOCS_LINK } from '../../constants';

type Options = {
  android?: string;
  ios?: string;
  androidUrl?: string;
  iosUrl?: string;
  token?: string;
  gitInfo?: Build['gitInfo'];
} & Partial<OptionDefaults>;

async function expoUpdate(passedOptions: Options): Promise<{ buildIndex: number; url: string }> {
  printHeader();

  const options = getOptionsWithDefaults(passedOptions);

  verifyExpoProject(options.projectRoot);

  const config = getConfig(options);

  validateConfig(config, { validateBuildPaths: true });

  const platformsToTest = getPlatformsToTest(config);

  if (platformsToTest.includes('android') && !options.androidUrl) {
    throwError({
      message:
        '`--androidUrl` must be provided for `sherlo expo-update` command when testing Android (based on devices defined in the config)',
      learnMoreLink: DOCS_LINK.expoUpdate,
    });
  }

  if (platformsToTest.includes('ios') && !options.iosUrl) {
    throwError({
      message:
        '`--iosUrl` must be provided for `sherlo expo-update` command when testing iOS (based on devices defined in the config)',
      learnMoreLink: DOCS_LINK.expoUpdate,
    });
  }

  const gitInfo = getGitInfo(passedOptions.gitInfo);

  const slug = getExpoSlug(options.projectRoot);

  const expoUpdateInfo = {
    slug,
    androidUrl: options.androidUrl,
    iosUrl: options.iosUrl,
  };

  return uploadBuildsAndRunTests({
    config,
    gitInfo,
    expoUpdateInfo,
  });
}

function verifyExpoProject(projectRoot: string): void {
  const appJsonPath = path.join(projectRoot, 'app.json');
  if (!fs.existsSync(appJsonPath)) {
    throwError({
      message: 'app.json file not found, this command is only for expo projects',
      learnMoreLink: DOCS_LINK.expoUpdate,
    });
  }

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  if (!appJson.expo || typeof appJson.expo !== 'object') {
    throwError({
      message:
        'this project does not appear to be an expo project, "expo" property not found or is not an object in app.json',
      learnMoreLink: DOCS_LINK.expoUpdate,
    });
  }
}

function getExpoSlug(projectRoot: string): string {
  const appJsonPath = path.join(projectRoot, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

  if (!appJson.expo.slug) {
    throwError({
      message: 'expo slug not found in app.json, please add a "slug" property to the "expo" object',
      learnMoreLink: DOCS_LINK.expoUpdate,
    });
  }

  return appJson.expo.slug;
}

export default expoUpdate;
