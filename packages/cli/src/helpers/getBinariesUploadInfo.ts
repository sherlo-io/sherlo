import { GetBuildUploadUrlsRequest, GetBuildUploadUrlsReturn } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import handleClientError from './handleClientError';

async function getBinariesUploadInfo(
  client: ReturnType<typeof SDKApiClient>,
  getBuildUploadUrlsRequest: GetBuildUploadUrlsRequest
): Promise<GetBuildUploadUrlsReturn['buildPresignedUploadUrls']> {
  const { buildPresignedUploadUrls } = await client
    .getBuildUploadUrls(getBuildUploadUrlsRequest)
    .catch(handleClientError);

  return buildPresignedUploadUrls;
}

export default getBinariesUploadInfo;
