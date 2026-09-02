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
import zlib from 'zlib';
import { Platform, StagedPlatformUploadUrls, StagedPresignedUploadUrl } from '@sherlo/api-types';
import fetch from 'node-fetch';
import { PLATFORM_LABEL } from '../../constants';
import logWarning from '../../helpers/logWarning';
import reporting from '../../helpers/reporting';
import throwError from '../../helpers/throwError';
import type { BundleResult } from './buildBundle';

const MAX_RETRIES = 3;
const TIMEOUT = 5 * 60 * 1000; // 5 minutes

export type StagedUploadKeys = {
  jsBundleS3Key: string;
  assetsS3Key?: string;
  /** S3 key of the uploaded module manifest (SHERLO-1894). Absent unless a manifest was uploaded. */
  manifestS3Key?: string;
};

/**
 * getStagedUploadUrls with the SHERLO-1894 `manifest` slot the api department is
 * adding in parallel. The slot is OPTIONAL here on purpose: the published
 * @sherlo/api-types this repo typechecks against does not carry it yet, and the
 * published sdk-client's GraphQL query does not select it, so at runtime it is
 * simply absent until both republish. A missing slot is a bail-open case, never an
 * error (old CLI vs new API and vice versa). Local forward-compat extension - drop
 * this and use the published type once api-types republishes with the slot.
 */
export type StagedUploadUrlsWithManifest = StagedPlatformUploadUrls & {
  manifest?: StagedPresignedUploadUrl;
};

async function uploadStagedArtifacts({
  platform,
  bundleResult,
  urls,
}: {
  platform: Platform;
  bundleResult: BundleResult;
  urls: StagedUploadUrlsWithManifest;
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

  // 3. Upload the gzipped module manifest - only when the build produced one AND the
  //    server offered a `manifest` slot (SHERLO-1894). BAIL-OPEN throughout: a
  //    missing slot (old API / published sdk-client that doesn't select it) is
  //    skipped silently, and any error gzipping or uploading is caught, warned, and
  //    swallowed. A manifest problem can NEVER fail or block the build.
  if (bundleResult.moduleManifest && urls.manifest) {
    try {
      const gzipped = zlib.gzipSync(bundleResult.moduleManifest.raw);
      await putBuffer({
        platform,
        label: 'module manifest',
        uploadUrl: urls.manifest.url,
        buffer: gzipped,
      });
      keys.manifestS3Key = urls.manifest.s3Key;
    } catch (error) {
      // putBuffer throws after its retries are exhausted; for the manifest that is a
      // warning, not a failure - the build proceeds without it.
      logWarning({
        message:
          `Failed to upload the ${PLATFORM_LABEL[platform]} module manifest ` +
          `(${error instanceof Error ? error.message : String(error)}); ` +
          'continuing without it.',
      });
    }
  }

  return keys;
}

export default uploadStagedArtifacts;

/* ========================================================================== */

/**
 * PUTs a buffer to a presigned S3 URL with protocol-appropriate keep-alive +
 * retry. Exported so other staged-upload producers (e.g. test:standard's
 * module-manifest pass, SHERLO-1943) reuse the exact same upload mechanics
 * instead of re-implementing the retry/agent logic.
 */
export async function putBuffer({
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
