/**
 * test:bundled command - the bundle-only fast path for staged builds.
 *
 * Builds a production plain-JS bundle + assets via the project's canonical
 * bundler, computes the base fingerprint, constructs per-platform gate
 * metadata, uploads bundle + assets to presigned S3 URLs, and sends the
 * staged inputs to the openBuild resolver for gate evaluation.
 *
 * Follows the exact same openBuild pattern as test:standard
 * (uploadOrReuseBuildsAndRunTests.ts): baseFingerprint + gateMetadata are
 * spread as top-level fields so the API resolver receives them server-side.
 */
import chalk from 'chalk';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import fetch from 'node-fetch';
import { Platform } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import { TEST_STANDARD_COMMAND } from '../../constants';
import { Options } from '../../types';
import {
  getGitInfo,
  getPlatformsToTest,
  getTokenParts,
  getValidatedCommandParams,
  handleClientError,
  printResultsUrl,
  printSherloIntro,
  reporting,
  waitForBuildResult,
} from '../../helpers';
import getBuildRunConfig from '../../helpers/getBuildRunConfig';
import getAppBuildUrl from '../../helpers/getAppBuildUrl';
import { computeBaseFingerprint } from '../../helpers/fingerprint';
import type { GateMetadataInput } from '../../helpers/fingerprint';
import compressDirectoryToTarGzip from '../../helpers/uploadOrPrintBinaryReuse/uploadBuild/getBuildData/compressDirectoryToTarGzip';
import { THIS_COMMAND } from './constants';
import { buildBundleForPlatform, buildGateMetadata, type BundleResult } from './buildBundle';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function testBundled(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  printSherloIntro();

  // 1. Validate params (no platform binary paths required - bundle only).
  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: false }
  );

  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  // Determine which platforms have devices configured.
  const platformsToTest = getPlatformsToTest(commandParams.devices);
  if (platformsToTest.length === 0) {
    console.log(
      chalk.yellow(
        'No devices configured. Add devices in sherlo.config.json to test on specific platforms.'
      )
    );
    return { url: '' };
  }

  console.log(chalk.bold('\n📦 Bundling for staged upload...\n'));

  // 2. Get gitInfo (same path as test:standard for byte-identical output).
  const gitInfo = await getGitInfo(commandParams.projectRoot, {
    branchOverride: commandParams.gitBranch,
  });

  // 3. Compute base fingerprint - identifies which base binary to stage against.
  const fpResult = await computeBaseFingerprint(commandParams.projectRoot);
  if (!fpResult.hash) {
    console.log(
      chalk.red(
        'Staged upload unavailable - ' + (fpResult.debugMessage ?? 'fingerprint computation failed')
      )
    );
    console.log(
      chalk.yellow(
        `Run \`sherlo ${TEST_STANDARD_COMMAND}\` for a full build with the same options.`
      )
    );
    return { url: '' };
  }
  const baseFingerprint = fpResult.hash;

  // 4. Build bundle + assets for each platform.
  const bundleResults = new Map<Platform, BundleResult>();

  for (const platform of platformsToTest) {
    const emoji = platform === 'android' ? '🤖' : '🍎';
    console.log(chalk.cyan(`\n${emoji} Building ${platform} bundle...`));

    try {
      const result = await buildBundleForPlatform({
        projectRoot: commandParams.projectRoot,
        platform,
      });
      bundleResults.set(platform, result);
      console.log(
        chalk.green(`  ✓ Bundle: ${path.basename(result.bundlePath)}`) +
          ` (${result.bundleSizeMb} MB, ${result.bundleFormat}, ${result.bundler})`
      );
      if (result.assetsDest) {
        console.log(chalk.green(`  ✓ Assets: ${result.assetInventory.length} files`));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`\n  ✗ ${message}`));
      return { url: '' };
    }
  }

  // 5. Get presigned upload URLs from the API.  The response carries
  //    `{ s3Key, url }` per platform - `url` is a presigned PUT URL for
  //    upload, `s3Key` is the key the runner uses for download.
  console.log(chalk.cyan('\n📤 Uploading bundle(s)...\n'));

  const bundleUploadUrls = await client.getBuildUploadUrls({
    platforms: platformsToTest,
    projectIndex,
    teamId,
  });

  // Collect bundle S3 keys per platform for getBuildRunConfig.
  const binaryS3Keys: { android?: string; ios?: string } = {};

  for (const platform of platformsToTest) {
    const result = bundleResults.get(platform)!;
    const uploadUrlInfo =
      platform === 'android'
        ? bundleUploadUrls.buildPresignedUploadUrls.android
        : bundleUploadUrls.buildPresignedUploadUrls.ios;

    if (!uploadUrlInfo) {
      console.log(chalk.red(`  No upload URL returned for ${platform}`));
      continue;
    }

    // Upload the bundle using the presigned PUT URL.
    await uploadFileToPresignedUrl({
      filePath: result.bundlePath,
      uploadUrl: uploadUrlInfo.url,
      label: `${platform} bundle`,
      fileSizeMb: result.bundleSizeMb,
    });

    // Store the S3 KEY (not the PUT URL) for the buildRunConfig.
    if (platform === 'android') {
      binaryS3Keys.android = uploadUrlInfo.s3Key;
    } else {
      binaryS3Keys.ios = uploadUrlInfo.s3Key;
    }
  }

  // 6. Upload assets (as .tar.gz) and collect their S3 keys.
  //    Assets get a separate presigned URL call so they land at a distinct
  //    S3 key the runner can download independently.
  const assetsS3Keys: { android?: string; ios?: string } = {};

  for (const platform of platformsToTest) {
    const result = bundleResults.get(platform)!;
    if (!result.assetsDest) continue;

    // Create the assets archive using the canonical tar+gzip helper
    // (reused from the binary upload flow).
    const archiveBuffer = await compressDirectoryToTarGzip({
      directoryPath: result.assetsDest,
      projectRoot: commandParams.projectRoot,
    });

    // Write the archive to a temp file for upload.
    const sherloDir = path.join(commandParams.projectRoot, '.sherlo');
    if (!fs.existsSync(sherloDir)) {
      fs.mkdirSync(sherloDir, { recursive: true });
    }
    const archivePath = path.join(sherloDir, `assets-${platform}.tar.gz`);
    await fs.promises.writeFile(archivePath, archiveBuffer);

    const archiveSizeMb = parseFloat((archiveBuffer.length / (1024 * 1024)).toFixed(2));

    // Get a separate presigned URL for the assets archive.
    const assetsUploadUrls = await client.getBuildUploadUrls({
      platforms: [platform],
      projectIndex,
      teamId,
    });

    const assetsUrlInfo =
      platform === 'android'
        ? assetsUploadUrls.buildPresignedUploadUrls.android
        : assetsUploadUrls.buildPresignedUploadUrls.ios;

    if (assetsUrlInfo) {
      await uploadFileToPresignedUrl({
        filePath: archivePath,
        uploadUrl: assetsUrlInfo.url,
        label: `${platform} assets`,
        fileSizeMb: archiveSizeMb,
      });

      if (platform === 'android') {
        assetsS3Keys.android = assetsUrlInfo.s3Key;
      } else {
        assetsS3Keys.ios = assetsUrlInfo.s3Key;
      }
    }
  }

  // 7. Build per-platform gate metadata (design §6).
  //    Same GateMetadataInput shape as test:standard's registerBase produces,
  //    but constructed from project config + built bundle instead of
  //    extracted from a binary.
  const gateMetadata: {
    android?: GateMetadataInput;
    ios?: GateMetadataInput;
  } = {};

  for (const platform of platformsToTest) {
    const result = bundleResults.get(platform)!;
    try {
      gateMetadata[platform] = await buildGateMetadata({
        projectRoot: commandParams.projectRoot,
        platform,
        bundleResult: result,
      });
    } catch {
      // Fail-soft per platform - gate metadata is best-effort.
    }
  }

  // 8. Build the buildRunConfig via the canonical helper (same as
  //    test:standard).  The bundle S3 keys flow through binaryS3Keys.
  const buildRunConfig = getBuildRunConfig({
    commandParams,
    binaryS3Keys,
  });

  // 9. Call openBuild with the exact same spread pattern as test:standard.
  //    baseFingerprint + gateMetadata are NOT in the OpenBuildRequest type
  //    but are accepted by the API resolver (same as changedFiles and
  //    nativeFingerprint).  TypeScript allows this via intermediate spread.
  console.log(chalk.cyan('\n🚀 Opening staged build...\n'));

  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling openBuild API (staged)',
    data: { teamId, projectIndex, command: 'testBundled', baseFingerprint },
    level: 'info',
  });

  // Build the extra-metadata payload the same way test:standard does.
  // The intermediate object assignment defeats excess-property checking.
  const stagedMetadata: Record<string, unknown> = {};
  if (baseFingerprint) {
    stagedMetadata.baseFingerprint = baseFingerprint;
    stagedMetadata.gateMetadata = gateMetadata;
    if (Object.keys(assetsS3Keys).length > 0) {
      stagedMetadata.bundledAssetsS3Keys = assetsS3Keys;
    }
  }

  let build: { index: number };
  try {
    const response = await client
      .openBuild({
        teamId,
        projectIndex,
        buildRunConfig,
        gitInfo,
        message: commandParams.message,
        ...stagedMetadata,
      })
      .catch(handleClientError);

    build = response.build;
  } catch (err) {
    // Gate refusal or API error - print with fallback guidance.
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`\n✗ Staged build refused: ${message}`));
    console.log(
      chalk.yellow(
        `\nRun \`sherlo ${TEST_STANDARD_COMMAND}\` for a full build with the same options.\n` +
          '  The full build validates your changes against the complete native environment.'
      )
    );
    throw err;
  }

  reporting.setTag('build_index', String(build.index));

  const platformLabel = platformsToTest.length === 2 ? 'both' : platformsToTest[0];
  reporting.setTag('platform', platformLabel);

  const url = getAppBuildUrl({
    buildIndex: build.index,
    projectIndex,
    teamId,
  });
  printResultsUrl(url);

  // 10. Optionally wait for results.
  if (commandParams.wait) {
    const exitCode = await waitForBuildResult({
      token: commandParams.token,
      buildIndex: build.index,
      projectIndex,
      teamId,
      waitTimeoutMinutes: parseWaitTimeout(commandParams.waitTimeout),
    });

    await reporting.flush().finally(() => {
      process.exit(exitCode);
    });
  }

  return { url };
}

export default testBundled;

// ---------------------------------------------------------------------------
// Upload helper (mirrors uploadBuild's core PUT-with-retries pattern)
// ---------------------------------------------------------------------------

/**
 * Upload a file to a presigned S3 URL with retries.
 *
 * Mirrors the core PUT/retry/keepAlive pattern from
 * `helpers/uploadOrPrintBinaryReuse/uploadBuild/uploadBuild.ts` but reads
 * the file raw (no platform-specific gzip) since JS bundles and asset
 * archives are already in their final format.
 */
async function uploadFileToPresignedUrl({
  filePath,
  uploadUrl,
  label,
  fileSizeMb,
}: {
  filePath: string;
  uploadUrl: string;
  label: string;
  fileSizeMb: number;
}): Promise<void> {
  const fileData = await fs.promises.readFile(filePath);

  console.log(chalk.dim(`  Uploading ${label}... (${fileSizeMb} MB)`));

  const agent = uploadUrl.startsWith('https')
    ? new https.Agent({ keepAlive: true })
    : new http.Agent({ keepAlive: true });

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: fileData,
        headers: {
          'Content-Length': fileData.length.toString(),
          'Content-Type': 'application/octet-stream',
        },
        agent,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server responded with ${response.status}: ${text}`);
      }

      console.log(chalk.green(`  ✓ ${label} uploaded`));
      return;
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(
          `Failed to upload ${label} after ${MAX_RETRIES} attempts: ` +
            `${error instanceof Error ? error.message : String(error)}`
        );
      }
      console.log(chalk.yellow(`  Upload attempt ${attempt + 1} failed, retrying...`));
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseWaitTimeout(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const minutes = parseInt(raw, 10);
  if (isNaN(minutes) || minutes < 1) return undefined;
  return minutes;
}
