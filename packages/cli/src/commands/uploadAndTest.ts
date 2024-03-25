import SDKApiClient from '@sherlo/sdk-client';
import { getUrlParams } from '@sherlo/shared';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  getBuildRunConfig,
  getConfig,
  getConfigPlatforms,
  getErrorMessage,
  getGitInfo,
  getProjectTokenParts,
  printHeader,
  uploadMobileBuilds,
} from '../utils';
import { GetConfigParameters } from '../utils/getConfig/getConfig';
import fs from 'fs';
import { Build } from '@sherlo/api-types';
import path from 'path';

const DEFAULT_CONFIG_PATH = 'sherlo.config.json';

async function uploadAndTest(
  parameters?: Partial<GetConfigParameters> & {
    gitInfo?: Build['gitInfo'];
    projectRoot?: string;
    asyncUploadBuildIndex?: number;
  }
): Promise<{ buildIndex: number; url: string }> {
  try {
    printHeader();

    const args = await yargs(hideBin(process.argv))
      .option('config', {
        default: DEFAULT_CONFIG_PATH,
        description: 'Path to Sherlo config',
        type: 'string',
      })
      .option('asyncUpload', {
        default: false,
        description:
          'Run Sherlo in lazy upload mode, meaning you don’t have to provide builds immidiately. You can send them with the same command later on',
        type: 'boolean',
      })
      .option('projectRoot', {
        default: '.',
        description:
          'use this option to specify the root of the react native project when working with monorepo',
        type: 'string',
      })
      .option('token', {
        description: 'Sherlo project token',
        type: 'string',
      })
      .option('android', {
        description: 'Path to Android build in .apk format',
        type: 'string',
      })
      .option('ios', {
        description: 'Path to iOS simulator build in .app or .tar.gz file format',
        type: 'string',
      }).argv;

    const asyncUpload = parameters?.asyncUpload || args.asyncUpload;
    const projectRoot = parameters?.projectRoot || args.projectRoot;

    const config = await getConfig({
      asyncUpload,
      config: parameters?.config || args.config,
      token: parameters?.token || args.token,
      ios: parameters?.ios || args.ios,
      android: parameters?.android || args.android,
    });

    const { apiToken, projectIndex, teamId } = getProjectTokenParts(config.token);

    const client = SDKApiClient(apiToken);

    const { buildPresignedUploadUrls } = await client
      .initBuild({
        platforms: getConfigPlatforms(config),
        projectIndex,
        teamId,
      })
      .catch((error) => {
        if (error.networkError.statusCode === 401) {
          throw new Error(
            getErrorMessage({
              type: 'auth',
              message: 'project token is invalid',
              learnMoreLink: 'https://docs.sherlo.io/getting-started/config#project-token',
            })
          );
        }

        throw new Error(getErrorMessage({ type: 'unexpected', message: error.message }));
      });

    await uploadMobileBuilds(config, buildPresignedUploadUrls);

    const { build } = await client
      .openBuild({
        teamId,
        projectIndex,
        buildRunConfig: getBuildRunConfig({ config, buildPresignedUploadUrls }),
        gitInfo: parameters?.gitInfo || getGitInfo(),
      })
      .catch((error) => {
        throw new Error(getErrorMessage({ type: 'unexpected', message: error.message }));
      });

    const url = `https://app.sherlo.io/build?${getUrlParams({
      teamId,
      projectIndex,
      buildIndex: build.index,
    })}`;

    const output = { buildIndex: build.index, url };

    const expoDir = path.join(projectRoot, '.expo');
    if (asyncUpload && fs.existsSync(expoDir)) {
      fs.writeFileSync(path.join(expoDir, 'sherlo.json'), JSON.stringify(output));
    }

    console.log(`View your test results at: ${url}\n`);

    return output;
  } catch (error) {
    console.error((error as Error).message);
  } finally {
    process.exit();
  }
}

export default uploadAndTest;
