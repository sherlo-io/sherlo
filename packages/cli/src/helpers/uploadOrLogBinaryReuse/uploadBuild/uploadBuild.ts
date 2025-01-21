import { Platform } from '@sherlo/api-types';
import https from 'https';
import fetch from 'node-fetch';
import { PLATFORM_LABEL } from '../../../constants';
import logBuildMessage from '../../logBuildMessage';
import throwError from '../../throwError';
import getBuildData from './getBuildData';
import getSizeInMB from './getSizeInMB';

const MAX_RETRIES = 3;
const TIMEOUT = 5 * 60 * 1000; // 5 minutes

async function uploadBuild({
  buildPath,
  platform,
  projectRoot,
  uploadUrl,
}: {
  buildPath: string;
  platform: Platform;
  projectRoot: string;
  uploadUrl: string;
}): Promise<void> {
  const buildData = getBuildData({ buildPath, platform, projectRoot });
  const buildSizeMB = getSizeInMB({ buffer: buildData, projectRoot });

  logBuildMessage({ message: `uploading build... (${buildSizeMB} MB)`, type: 'info' });

  /**
   * Configure HTTPS agent for optimized uploads:
   * - keepAlive: true - Reuses TCP connection between requests, reducing latency (default in Node.js 19+)
   * - timeout: 60s - Prevents hanging requests for large uploads
   *
   * Note: We set keepAlive explicitly for compatibility with Node.js < 19
   */
  const agent = new https.Agent({
    keepAlive: true,
    timeout: TIMEOUT,
  });

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: buildData,
        headers: {
          'Content-Length': buildData.length.toString(),
          'Content-Type': 'application/octet-stream',
        },
        timeout: TIMEOUT,
        agent,
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Server responded with ${response.status}: ${responseText}`);
      }

      logBuildMessage({ message: 'upload complete', type: 'success', endsWithNewLine: true });
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

      logBuildMessage({
        message: `Upload failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`,
        type: 'info',
      });
    }
  }
}

export default uploadBuild;
