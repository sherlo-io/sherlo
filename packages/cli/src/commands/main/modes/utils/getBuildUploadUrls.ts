import SDKApiClient from '@sherlo/sdk-client/dist/sdkClient';
import { GetBuildUploadUrlsRequest, GetBuildUploadUrlsReturn } from '@sherlo/api-types';
import { getErrorMessage } from '../../utils';
import { docsLink } from '../../constants';

async function getBuildUploadUrls(
  client: ReturnType<typeof SDKApiClient>,
  getBuildUploadUrlsRequest: GetBuildUploadUrlsRequest
): Promise<GetBuildUploadUrlsReturn['buildPresignedUploadUrls']> {
  const { buildPresignedUploadUrls } = await client
    .getBuildUploadUrls(getBuildUploadUrlsRequest)
    .catch((error) => {
      if (error.networkError.statusCode === 401) {
        throw new Error(
          getErrorMessage({
            type: 'auth',
            message: 'token is invalid',
            learnMoreLink: docsLink.token,
          })
        );
      }

      throw new Error(getErrorMessage({ type: 'unexpected', message: error.message }));
    });

  return buildPresignedUploadUrls;
}

export default getBuildUploadUrls;
