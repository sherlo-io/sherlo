import SDKApiClient from '@sherlo/sdk-client';
import { getUrlParams } from '@sherlo/shared';
import {
  getBuildRunConfig,
  getConfigPlatforms,
  getErrorMessage,
  getProjectTokenParts,
  printHeader,
  uploadMobileBuilds,
} from '../../utils';
import fs from 'fs';
import path from 'path';
import getArguments, { GHActionArgs } from './_getArguments';
import {
  GetBuildUploadUrlsRequest,
  GetBuildUploadUrlsReturn,
  OpenBuildRequest,
  OpenBuildReturn,
} from '@sherlo/api-types';
import { UploadMobileBuilsPaths } from '../../utils/uploadMobileBuilds';

type MainOutput = { buildIndex: number; url: string };

async function main(ghActionArgs?: GHActionArgs): Promise<MainOutput> {
  printHeader();

  const args = getArguments(ghActionArgs);
  const { apiToken, projectIndex, teamId } = getProjectTokenParts(args.token);
  const client = SDKApiClient(apiToken);

  switch (args.mode) {
    case 'sync': {
      const uploadUrls = await getUploadUrlsAndUploadBuilds(
        client,
        { platforms: getConfigPlatforms(args.config), projectIndex, teamId },
        {
          android: args.config.android?.path,
          ios: args.config.ios?.path,
        }
      );

      const build = await openBuild(client, {
        teamId,
        projectIndex,
        buildRunConfig: getBuildRunConfig({
          config: args.config,
          buildPresignedUploadUrls: uploadUrls,
        }),
        gitInfo: args.gitInfo,
      });

      const output = createOutput({ buildIndex: build.index, projectIndex, teamId });

      console.log(`View your test results at: ${output.url}\n`);

      return output;
    }
    case 'asyncInit': {
      const build = await openBuild(client, {
        teamId,
        projectIndex,
        buildRunConfig: getBuildRunConfig({ config: args.config }),
        asyncUpload: true,
        gitInfo: args.gitInfo,
      });

      const output = createOutput({ buildIndex: build.index, projectIndex, teamId });

      createExpoSherloFile({ projectRoot: args.projectRoot, output });

      console.log(
        `Sherlo is awaiting your builds to be uploaded asynchronously.\nBuild index is ${output.buildIndex}.\n`
      );

      return output;
    }
    case 'asyncUpload': {
      const uploadUrls = await getUploadUrlsAndUploadBuilds(
        client,
        {
          platforms: args.platform === 'android' ? ['android'] : ['ios'],
          projectIndex,
          teamId,
        },
        args.platform === 'android' ? { android: args.path } : { ios: args.path }
      );

      const buildIndex = args.asyncUploadBuildIndex!;

      await client
        .asyncUpload({
          buildIndex,
          projectIndex,
          teamId,
          androidS3Key: uploadUrls.android?.s3Key,
          iosS3Key: uploadUrls.ios?.s3Key,
        })
        .catch((error) => {
          throw new Error(getErrorMessage({ type: 'unexpected', message: error.message }));
        });

      const output = createOutput({ buildIndex, projectIndex, teamId });

      return output;
    }
    default:
      throw new Error(getErrorMessage({ type: 'default', message: 'Unknown mode' }));
  }
}

async function getUploadUrlsAndUploadBuilds(
  client: ReturnType<typeof SDKApiClient>,
  getBuildUploadUrlsRequest: GetBuildUploadUrlsRequest,
  paths: UploadMobileBuilsPaths
): Promise<GetBuildUploadUrlsReturn['buildPresignedUploadUrls']> {
  const { buildPresignedUploadUrls } = await client
    .getBuildUploadUrls(getBuildUploadUrlsRequest)
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

  await uploadMobileBuilds(paths, buildPresignedUploadUrls);

  return buildPresignedUploadUrls;
}

async function openBuild(
  client: ReturnType<typeof SDKApiClient>,
  openBuildRequest: OpenBuildRequest
): Promise<OpenBuildReturn['build']> {
  const { build } = await client.openBuild(openBuildRequest).catch((error) => {
    throw new Error(getErrorMessage({ type: 'unexpected', message: error.message }));
  });

  return build;
}

function createOutput({
  buildIndex,
  projectIndex,
  teamId,
}: {
  buildIndex: number;
  projectIndex: number;
  teamId: string;
}): MainOutput {
  const url = `https://app.sherlo.io/build?${getUrlParams({
    teamId,
    projectIndex,
    buildIndex,
  })}`;

  return { buildIndex, url };
}

function createExpoSherloFile({
  projectRoot,
  output,
}: {
  projectRoot: string;
  output: MainOutput;
}): void {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in projectRoot directory (${projectRoot}).`);
  }

  try {
    const packageJsonData = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonData);

    // Check if the scripts section is defined and if 'eas-build-on-success' script exists
    if (packageJson.scripts && packageJson.scripts['eas-build-on-success']) {
      const expoDir = path.join(projectRoot, '.expo');

      // Check if the directory exists
      if (!fs.existsSync(expoDir)) {
        // If the directory does not exist, create it
        fs.mkdirSync(expoDir, { recursive: true });
      }

      // Now that we've ensured the directory exists, write the file
      fs.writeFileSync(path.join(expoDir, 'sherlo.json'), JSON.stringify(output));
    }
  } catch (err) {
    // If there's an error, continue
  }
}

export default main;
