import { getUrlParams } from '@sherlo/shared';
import { appDomain } from '../../constants';

function getAppBuildUrl({
  buildIndex,
  projectIndex,
  teamId,
}: {
  buildIndex: number;
  projectIndex: number;
  teamId: string;
}): string {
  return `${appDomain}/build?${getUrlParams({
    teamId,
    projectIndex,
    buildIndex,
  })}`;
}

export default getAppBuildUrl;
