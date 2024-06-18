import SDKApiClient from '@sherlo/sdk-client/dist/sdkClient';
import { GetBuildUploadUrlsRequest, GetBuildUploadUrlsReturn } from '@sherlo/api-types';
import handleClientError from './handleClientError';

async function getBuildUploadUrls(
  client: ReturnType<typeof SDKApiClient>,
  getBuildUploadUrlsRequest: GetBuildUploadUrlsRequest
): Promise<GetBuildUploadUrlsReturn['buildPresignedUploadUrls']> {
  const { buildPresignedUploadUrls } = await client
    .getBuildUploadUrls(getBuildUploadUrlsRequest)
    .catch(handleClientError);

  return buildPresignedUploadUrls;
}

export default getBuildUploadUrls;
