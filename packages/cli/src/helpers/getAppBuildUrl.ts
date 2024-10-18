import { getUrlParams } from '@sherlo/shared';
import { APP_DOMAIN } from '../constants';

function getAppBuildUrl({
  buildIndex,
  projectIndex,
  teamId,
}: {
  buildIndex: number;
  projectIndex: number;
  teamId: string;
}): string {
  return `${APP_DOMAIN}/build?${getUrlParams({
    teamId,
    projectIndex,
    buildIndex,
  })}`;
}

export default getAppBuildUrl;
