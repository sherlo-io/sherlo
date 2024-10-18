import { projectApiTokenLength, teamIdLength } from '@sherlo/shared';

function getTokenParts(token: string): {
  apiToken: string;
  projectIndex: number;
  teamId: string;
} {
  return {
    apiToken: token.slice(0, projectApiTokenLength),
    teamId: token.slice(projectApiTokenLength, projectApiTokenLength + teamIdLength),
    projectIndex: Number(token.slice(projectApiTokenLength + teamIdLength)),
  };
}

export default getTokenParts;
