import { Build } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import fs from 'fs';
import path from 'path';
import { docsLink } from '../constants';
import { getErrorMessage, getTokenParts } from '../utils';
import { Config } from '../types';
import { getAppBuildUrl, getBuildRunConfig, handleClientError } from './utils';

async function asyncInitMode(
  {
    token,
    config,
    gitInfo,
    projectRoot,
  }: {
    token: string;
    config: Config<'withoutBuildPaths'>;
    gitInfo: Build['gitInfo'];
    projectRoot: string;
  },
  isExpoRemoteMode: boolean
): Promise<{ buildIndex: number; url: string }> {
  if (isExpoRemoteMode) {
    validateEasBuildOnSuccessScript(projectRoot);
  }

  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = SDKApiClient(apiToken);

  const { build } = await client
    .openBuild({
      teamId,
      projectIndex,
      gitInfo,
      asyncUpload: true,
      buildRunConfig: getBuildRunConfig({ config }),
    })
    .catch(handleClientError);

  const buildIndex = build.index;
  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  if (isExpoRemoteMode) {
    createExpoSherloTempFile({ buildIndex, projectRoot, token, url });

    console.log('Sherlo is waiting for your builds to be completed on the Expo servers.');
  } else {
    console.log(
      `Sherlo is waiting for your builds to be uploaded asynchronously.\nCurrent build index: ${buildIndex}.\n`
    );
  }

  return { buildIndex, url };
}

export default asyncInitMode;

/* ========================================================================== */

function validateEasBuildOnSuccessScript(projectRoot: string): void {
  const packageJsonPath = path.resolve(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(
      getErrorMessage({
        message: `package.json file not found at location "${projectRoot}"; make sure the directory is correct or pass the \`--projectRoot\` flag to the script`,
        learnMoreLink: docsLink.scriptFlags,
      })
    );
  }

  const packageJsonData = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonData);

  if (!packageJson.scripts || !packageJson.scripts['eas-build-on-success']) {
    throw new Error(
      getErrorMessage({
        message: '"eas-build-on-success" script is not defined in package.json',
        learnMoreLink: docsLink.remoteExpoBuilds,
      })
    );
  }
}

function createExpoSherloTempFile({
  projectRoot,
  buildIndex,
  url,
  token,
}: {
  projectRoot: string;
  buildIndex: number;
  token: string;
  url: string;
}): void {
  const expoDir = path.resolve(projectRoot, '.expo');

  // Check if the directory exists
  if (!fs.existsSync(expoDir)) {
    // If the directory does not exist, create it
    fs.mkdirSync(expoDir, { recursive: true });
  }

  // Now that we've ensured the directory exists, write the file
  fs.writeFileSync(
    path.resolve(expoDir, 'sherlo.json'),
    JSON.stringify({ buildIndex, token, url })
  );
}
