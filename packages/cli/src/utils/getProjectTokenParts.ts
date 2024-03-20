import { projectApiTokenLength, teamIdLength } from '@sherlo/shared';

function getProjectTokenParts(projectToken: string): {
  apiToken: string;
  projectIndex: number;
  teamId: string;
} {
  return {
    apiToken: projectToken.slice(0, projectApiTokenLength),
    teamId: projectToken.slice(projectApiTokenLength, projectApiTokenLength + teamIdLength),
    projectIndex: Number(projectToken.slice(projectApiTokenLength + teamIdLength)),
  };
}

export default getProjectTokenParts;
