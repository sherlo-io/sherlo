import { Platform } from '@sherlo/api-types';
import fetch from 'node-fetch';
import { PLATFORM_LABEL } from '../../../constants';
import logBuildMessage from '../../logBuildMessage';
import throwError from '../../throwError';
import getBuildData from './getBuildData';

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

  logBuildMessage({ message: 'uploading build...', type: 'info' });

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: buildData,
  });

  if (!response || !response.ok) {
    throwError({
      type: 'unexpected',
      error: new Error(`Failed to upload ${PLATFORM_LABEL[platform]} build`),
    });
  }

  logBuildMessage({ message: 'upload complete', type: 'success', endsWithNewLine: true });
}

export default uploadBuild;
