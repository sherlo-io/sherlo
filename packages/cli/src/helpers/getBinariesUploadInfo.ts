import { GetBuildUploadUrlsRequest, GetBuildUploadUrlsReturn } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import handleClientError from './handleClientError';

async function getBinariesUploadInfo(
  client: ReturnType<typeof SDKApiClient>,
  request: GetBuildUploadUrlsRequest
): Promise<GetBuildUploadUrlsReturn['buildPresignedUploadUrls']> {
  const { buildPresignedUploadUrls: binariesUploadInfo } = await client
    .getBuildUploadUrls(request)
    .catch(handleClientError);

  return binariesUploadInfo;
}

export default getBinariesUploadInfo;
