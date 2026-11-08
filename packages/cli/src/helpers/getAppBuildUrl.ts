import { getUrlParams } from '@sherlo/shared';
import getAppDomain from './getAppDomain';

function getAppBuildUrl({
  buildIndex,
  projectIndex,
  teamId,
}: {
  buildIndex: number;
  projectIndex: number;
  teamId: string;
}): string {
  return `${getAppDomain()}/build?${getUrlParams({
    teamId,
    projectIndex,
    buildIndex,
  })}`;
}

export default getAppBuildUrl;
