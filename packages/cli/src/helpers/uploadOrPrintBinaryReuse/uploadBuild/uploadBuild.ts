import { Platform } from '@sherlo/api-types';
import http from 'http';
import https from 'https';
import fetch from 'node-fetch';
import { whileShowing } from '../../../commands/shared/terminal';
import { PLATFORM_LABEL } from '../../../constants';
import { emit } from '../../transcriptSink';
import reporting from '../../reporting';
import throwError from '../../throwError';
import getBuildData from './getBuildData';
import getSizeInMB from './getSizeInMB';

const MAX_RETRIES = 3;
const TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * The one effect a binary upload performs: turn a path into the bytes to send,
 * and the size the transcript announces before sending them.
 *
 * A PARAMETER SO AN EXPECTATION PRODUCER RUNS THIS EXACT FUNCTION. The upload's
 * step in progress and its retry lines are shown from here, around the PUT, so a
 * producer that re-implemented the block could drift from it silently. Instead
 * it resolves a scripted size and a zero-length body, and the segment order, the
 * retry branching and every literal come from the shipped code.
 */
export type BinaryUploadEffects = {
  readBinary: (
    buildPath: string,
    platform: Platform,
    projectRoot: string
  ) => Promise<{ data: Buffer; sizeMb: string }>;
  putBinary: (
    uploadUrl: string,
    data: Buffer
  ) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
};

export const REAL_BINARY_UPLOAD_EFFECTS: BinaryUploadEffects = {
  readBinary: async (buildPath, platform, projectRoot) => {
    const data = await getBuildData({ buildPath, platform, projectRoot });
    return { data, sizeMb: getSizeInMB({ buffer: data }) };
  },
  putBinary: (uploadUrl, data) => {
    // Use protocol-appropriate agent (HTTP for local S3, HTTPS for AWS)
    const agent = uploadUrl.startsWith('https')
      ? new https.Agent({ keepAlive: true, timeout: TIMEOUT })
      : new http.Agent({ keepAlive: true, timeout: TIMEOUT });

    return fetch(uploadUrl, {
      method: 'PUT',
      body: data,
      headers: {
        'Content-Length': data.length.toString(),
        'Content-Type': 'application/octet-stream',
      },
      timeout: TIMEOUT,
      agent,
    });
  },
};

async function uploadBuild({
  buildPath,
  platform,
  projectRoot,
  uploadUrl,
  effects = REAL_BINARY_UPLOAD_EFFECTS,
}: {
  buildPath: string;
  platform: Platform;
  projectRoot: string;
  uploadUrl: string;
  effects?: BinaryUploadEffects;
}): Promise<void> {
  const { data: buildData, sizeMb: buildSizeMB } = await effects.readBinary(
    buildPath,
    platform,
    projectRoot
  );

  reporting.addBreadcrumb({
    category: 'api',
    message: 'Uploading build to S3',
    data: { platform, buildSizeMB, buildPath },
    level: 'info',
  });

  // An upload is only a wait: a spinner in a terminal that leaves no line, one plain line in a log
  // (operator ruling 2026-10-13). The step a person reads is the test it starts.
  await whileShowing({ kind: 'binary-uploading', sizeMb: buildSizeMB, platform }, () =>
    putWithRetries({ platform, uploadUrl, buildData, effects })
  );
}

/** PUT the bytes, trying again up to {@link MAX_RETRIES} times; the last failure ends the run. */
async function putWithRetries({
  platform,
  uploadUrl,
  buildData,
  effects,
}: {
  platform: Platform;
  uploadUrl: string;
  buildData: Buffer;
  effects: BinaryUploadEffects;
}): Promise<void> {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const response = await effects.putBinary(uploadUrl, buildData);

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Server responded with ${response.status}: ${responseText}`);
      }

      return;
    } catch (error) {
      attempt++;

      // Log detailed error info
      console.error('Upload error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
        attempt,
        buildSize: buildData.length,
        url: uploadUrl,
      });

      if (attempt === MAX_RETRIES) {
        throwError({
          type: 'unexpected',
          error: new Error(
            `Failed to upload ${PLATFORM_LABEL[platform]} build after ${MAX_RETRIES} attempts. ` +
              `Last error (${error.code}): ${error.message}`
          ),
        });
      }

      emit({ kind: 'binary-upload-retry', attempt, maxRetries: MAX_RETRIES });
    }
  }
}

export default uploadBuild;
