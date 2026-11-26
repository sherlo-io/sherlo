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
/** The wait before the next try, longer each time: after the first failure, then after the second. */
const RETRY_WAITS_MS = [5_000, 15_000];
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
  /** Waits this many milliseconds before a new try; a builder that leaves it out waits for real. */
  wait?: (ms: number) => Promise<void>;
};

export const REAL_BINARY_UPLOAD_EFFECTS: BinaryUploadEffects = {
  readBinary: async (buildPath, platform, projectRoot) => {
    const data = await getBuildData({ buildPath, platform, projectRoot });
    return { data, sizeMb: getSizeInMB({ bytes: data.length }) };
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
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

  // An upload is only a wait: a spinner in a terminal that leaves no line, one plain line in a log.
  // The step a person reads is the test it starts.
  await whileShowing({ kind: 'binary-uploading', sizeMb: buildSizeMB, platform }, () =>
    putWithRetries({
      what: `${PLATFORM_LABEL[platform]} build`,
      uploadUrl,
      buildData,
      effects,
      onRetry: (attempt) => emit({ kind: 'binary-upload-retry', attempt, maxRetries: MAX_RETRIES }),
    })
  );
}

/**
 * PUT the bytes, trying again up to {@link MAX_RETRIES} times with a longer wait each time; the last
 * failure ends the run. Every upload of a build or staged file goes through here, so no failure
 * prints the signed upload link.
 */
export async function putWithRetries({
  what,
  uploadUrl,
  buildData,
  effects,
  onRetry,
}: {
  what: string;
  uploadUrl: string;
  buildData: Buffer;
  effects: Pick<BinaryUploadEffects, 'putBinary' | 'wait'>;
  onRetry?: (attempt: number) => void;
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

      // The upload link is a signed secret and a fetch error's message repeats it: never print it.
      const message = String(error.message).split(uploadUrl).join('<upload link>');

      console.error('Upload error details:', {
        code: error.code,
        message,
        attempt,
        buildSize: buildData.length,
      });

      if (attempt === MAX_RETRIES) {
        throwError({
          type: 'unexpected',
          error: new Error(
            `Failed to upload ${what} after ${MAX_RETRIES} attempts. ` +
              `Last error (${error.code}): ${message}`
          ),
        });
      }

      onRetry?.(attempt);
      await (effects.wait ?? REAL_BINARY_UPLOAD_EFFECTS.wait!)(RETRY_WAITS_MS[attempt - 1]);
    }
  }
}

export default uploadBuild;
