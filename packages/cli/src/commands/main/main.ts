import SDKApiClient from '@sherlo/sdk-client';
import { getUrlParams } from '@sherlo/shared';
import {
  getBuildRunConfig,
  getConfig,
  getConfigPlatforms,
  getErrorMessage,
  getProjectTokenParts,
  printHeader,
  uploadMobileBuilds,
} from '../../utils';
import fs from 'fs';
import path from 'path';
import getArguments, { Arguments, OverrideArguments } from './_getArguments';
import {
  GetBuildUploadUrlsRequest,
  GetBuildUploadUrlsReturn,
  OpenBuildRequest,
  OpenBuildReturn,
} from '@sherlo/api-types';
import { BaseConfig } from '../../types';

type MainOutput = { buildIndex: number; url: string };

async function main(overrideArguments?: OverrideArguments): Promise<MainOutput> {
  try {
    printHeader();

    const args = await getArguments(overrideArguments);

    switch (args.mode) {
      case 'sync': {
        const config = await getConfig<'withPaths'>(args);
        const { apiToken, projectIndex, teamId } = getProjectTokenParts(config.token);
        const client = SDKApiClient(apiToken);

        const uploadUrls = await getUploadUrlsAndUploadBuilds(
          client,
          { platforms: getConfigPlatforms(config), projectIndex, teamId },
          args
        );

        const build = await openBuild(client, {
          teamId,
          projectIndex,
          buildRunConfig: getBuildRunConfig({ config, buildPresignedUploadUrls: uploadUrls }),
          gitInfo: args.gitInfo,
        });

        const output = createOutput({ buildIndex: build.index, projectIndex, teamId });

        console.log(`View your test results at: ${output.url}\n`);

        return output;
      }
      case 'asyncInit': {
        const config = await getConfig<'withoutPaths'>(args);
        const { apiToken, projectIndex, teamId } = getProjectTokenParts(config.token);
        const client = SDKApiClient(apiToken);

        const build = await openBuild(client, {
          teamId,
          projectIndex,
          buildRunConfig: getBuildRunConfig({ config }),
          asyncUpload: true,
          gitInfo: args.gitInfo,
        });

        const output = createOutput({ buildIndex: build.index, projectIndex, teamId });

        createExpoSherloFile(args, output);

        console.log(
          `Sherlo is awaiting your builds to be uploaded asynchronously.\nView your test results at: ${output.url}\n`
        );

        return output;
      }
      case 'asyncUpload': {
        const config = await getConfig<'withoutPaths'>(args);
        const { apiToken, projectIndex, teamId } = getProjectTokenParts(config.token);
        const client = SDKApiClient(apiToken);

        const platforms = getPlatformsForAsyncUpload(config);

        const uploadUrls = await getUploadUrlsAndUploadBuilds(
          client,
          {
            platforms,
            projectIndex,
            teamId,
          },
          args
        );

        const buildIndex = args.asyncUploadBuildIndex!;

        await client
          .asyncUpload({
            buildIndex,
            projectIndex,
            teamId,
            androidS3Key: uploadUrls.android?.url,
            iosS3Key: uploadUrls.ios?.url,
          })
          .catch((error) => {
            throw new Error(getErrorMessage({ type: 'unexpected', message: error.message }));
          });

        const output = createOutput({ buildIndex, projectIndex, teamId });

        return output;
      }
      default:
        break;
    }
  } catch (error) {
    console.error((error as Error).message);
  } finally {
    process.exit();
  }
}

async function getUploadUrlsAndUploadBuilds(
  client: ReturnType<typeof SDKApiClient>,
  getBuildUploadUrlsRequest: GetBuildUploadUrlsRequest,
  args: Arguments
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

  await uploadMobileBuilds(args, buildPresignedUploadUrls);

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

function getPlatformsForAsyncUpload(config: BaseConfig): GetBuildUploadUrlsRequest['platforms'] {
  const platforms = getConfigPlatforms(config);

  if (platforms.length > 1) {
    throw new Error(
      getErrorMessage({
        type: 'default',
        message:
          "Don't use 'asyncUploadBuildIndex' if you're providing android and ios at the same time",
      })
    );
  } else if (platforms.length === 0) {
    throw new Error(
      getErrorMessage({
        type: 'default',
        message:
          "When using 'asyncUploadBuildIndex' you need to provide one build path, ios or android",
      })
    );
  }

  return platforms;
}
function createExpoSherloFile(args: Arguments, output: MainOutput): void {
  const expoDir = path.join(args.projectRoot, '.expo');
  if (args.asyncUpload && fs.existsSync(expoDir)) {
    fs.writeFileSync(path.join(expoDir, 'sherlo.json'), JSON.stringify(output));
  }
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

export default main;
