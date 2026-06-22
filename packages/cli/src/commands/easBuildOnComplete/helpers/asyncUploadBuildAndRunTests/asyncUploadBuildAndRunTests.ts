import { Platform } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import { DEFAULT_PROJECT_ROOT, PLATFORM_LABEL } from '../../../../constants';
import {
  getAppBuildUrl,
  getGitInfo,
  getTokenParts,
  getValidatedBinariesInfoAndNextBuildIndex,
  handleClientError,
  printResultsUrl,
  uploadOrPrintBinaryReuse,
  reporting,
} from '../../../../helpers';
import {
  collectDependencyGraph,
  computeChangedFiles,
  computeNativeFingerprint,
} from '../../../../helpers/turbosnap';
import { THIS_COMMAND } from '../../constants';
import getBuildPath from './getBuildPath';

async function asyncUploadBuildAndRunTests({
  buildIndex,
  easBuildProfile,
  token,
}: {
  buildIndex: number;
  easBuildProfile: string;
  token: string;
}) {
  const platform = process.env.EAS_BUILD_PLATFORM as Platform;

  const buildPath = getBuildPath({ easBuildProfile, platform });

  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = sdkClient({ authToken: apiToken });

  const { binariesInfo } = await getValidatedBinariesInfoAndNextBuildIndex({
    buildPath,
    client,
    command: THIS_COMMAND,
    platform,
    projectIndex,
    teamId,
  });

  await uploadOrPrintBinaryReuse({
    binariesInfo,
    projectRoot: DEFAULT_PROJECT_ROOT,
    android: platform === 'android' ? buildPath : undefined,
    ios: platform === 'ios' ? buildPath : undefined,
  });

  // Collect the Metro dependency-graph sidecar emitted during the EAS cloud build.
  // The serializer writes it to node_modules/.cache/sherlo/graph.json in the build workspace.
  const dependencyGraphRaw = collectDependencyGraph(DEFAULT_PROJECT_ROOT);
  const dependencyGraph = dependencyGraphRaw !== null
    ? JSON.stringify(dependencyGraphRaw)
    : undefined;

  // TurboSnap: compute changed files and native fingerprint for the EAS-cloud path.
  // The same bail-to-full conditions apply: shallow clone, dirty tree, no mergeBaseSha.
  const gitInfo = await getGitInfo(DEFAULT_PROJECT_ROOT);
  const changedFilesResult = await computeChangedFiles(DEFAULT_PROJECT_ROOT, gitInfo);
  let changedFiles: string[] | undefined;
  if ('changedFiles' in changedFilesResult) {
    changedFiles = changedFilesResult.changedFiles;
  } else {
    console.log(`[Sherlo] TurboSnap: full capture - ${changedFilesResult.reason}`);
  }
  const nativeFingerprint = (await computeNativeFingerprint(DEFAULT_PROJECT_ROOT)) ?? undefined;

  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling asyncUpload API',
    data: { buildIndex, teamId, projectIndex, platform },
    level: 'info',
  });

  const { couldRunThisBuildRightNow } = await client
    .asyncUpload({
      buildIndex,
      projectIndex,
      teamId,
      androidS3Key: binariesInfo.android?.s3Key,
      iosS3Key: binariesInfo.ios?.s3Key,
      sdkVersion: binariesInfo.sdkVersion,
      fileName: binariesInfo[platform]?.fileName,
      dependencyGraph,
      changedFiles,
      nativeFingerprint,
    })
    .catch(handleClientError);

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  if (!couldRunThisBuildRightNow) {
    console.log(
      `⏳ Waiting for ${
        platform === 'android' ? PLATFORM_LABEL.ios : PLATFORM_LABEL.android
      } build to complete...\n`
    );
  } else {
    console.log('🚀 All required platforms are ready - starting tests...\n');

    printResultsUrl(url);
  }

  return { buildIndex, url };
}

export default asyncUploadBuildAndRunTests;
