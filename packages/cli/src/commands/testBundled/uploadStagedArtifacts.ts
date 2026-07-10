/**
 * Uploads the staged JS bundle (and, when present, the assets archive) to the
 * presigned S3 URLs returned by getStagedUploadUrls, and returns the S3 keys
 * to mirror into the openBuild buildRunConfig (SHERLO-1707).
 *
 * - jsBundle: the single plain-JS bundle file is PUT verbatim.
 * - assets:   the Metro --assets-dest output directory is packed into a single
 *             gzipped tar (one S3 object) and PUT. Only when the bundler
 *             actually produced assets (bundleResult.assetsDest is set).
 *
 * Uses the same protocol-appropriate keep-alive agent + retry loop as the
 * binary uploadBuild helper so local-S3 (http) and AWS (https) both work.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import { Platform, StagedPlatformUploadUrls } from '@sherlo/api-types';
import fetch from 'node-fetch';
import { PLATFORM_LABEL } from '../../constants';
import reporting from '../../helpers/reporting';
import throwError from '../../helpers/throwError';
import type { BundleResult } from './buildBundle';

const MAX_RETRIES = 3;
const TIMEOUT = 5 * 60 * 1000; // 5 minutes

export type StagedUploadKeys = {
  jsBundleS3Key: string;
  assetsS3Key?: string;
};

async function uploadStagedArtifacts({
  platform,
  bundleResult,
  urls,
}: {
  platform: Platform;
  bundleResult: BundleResult;
  urls: StagedPlatformUploadUrls;
}): Promise<StagedUploadKeys> {
  // 1. Upload the JS bundle verbatim.
  const bundleBuffer = fs.readFileSync(bundleResult.bundlePath);
  await putBuffer({
    platform,
    label: 'JS bundle',
    uploadUrl: urls.jsBundle.url,
    buffer: bundleBuffer,
  });

  const keys: StagedUploadKeys = { jsBundleS3Key: urls.jsBundle.s3Key };

  // 2. Upload the assets archive - only when the bundler produced assets.
  if (bundleResult.assetsDest) {
    const archivePath = path.join(os.tmpdir(), `sherlo-staged-assets-${platform}.tar.gz`);
    try {
      // Pack the assets dir into a single gzipped tar (one S3 object). Use the
      // system tar via execFileSync (no shell) - the same approach buildBundle
      // uses to shell out to the bundler.
      execFileSync('tar', ['-czf', archivePath, '-C', bundleResult.assetsDest, '.'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const assetsBuffer = fs.readFileSync(archivePath);
      await putBuffer({
        platform,
        label: 'assets',
        uploadUrl: urls.assets.url,
        buffer: assetsBuffer,
      });

      keys.assetsS3Key = urls.assets.s3Key;
    } finally {
      fs.rmSync(archivePath, { force: true });
    }
  }

  return keys;
}

export default uploadStagedArtifacts;

/* ========================================================================== */

async function putBuffer({
  platform,
  label,
  uploadUrl,
  buffer,
}: {
  platform: Platform;
  label: string;
  uploadUrl: string;
  buffer: Buffer;
}): Promise<void> {
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Uploading staged artifact to S3',
    data: { platform, label, bytes: buffer.length },
    level: 'info',
  });

  // Protocol-appropriate agent (HTTP for local S3, HTTPS for AWS).
  const agent = uploadUrl.startsWith('https')
    ? new https.Agent({ keepAlive: true, timeout: TIMEOUT })
    : new http.Agent({ keepAlive: true, timeout: TIMEOUT });

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: buffer,
        headers: {
          'Content-Length': buffer.length.toString(),
          'Content-Type': 'application/octet-stream',
        },
        timeout: TIMEOUT,
        agent,
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Server responded with ${response.status}: ${responseText}`);
      }

      return;
    } catch (error: any) {
      attempt++;

      if (attempt === MAX_RETRIES) {
        throwError({
          type: 'unexpected',
          error: new Error(
            `Failed to upload ${PLATFORM_LABEL[platform]} ${label} after ${MAX_RETRIES} attempts. ` +
              `Last error (${error.code}): ${error.message}`
          ),
        });
      }
    }
  }
}
