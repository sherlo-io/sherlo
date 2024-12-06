import { PROJECT_API_TOKEN_LENGTH, TEAM_ID_LENGTH } from '@sherlo/shared';

function getTokenParts(token: string): {
  apiToken: string;
  projectIndex: number;
  teamId: string;
} {
  return {
    apiToken: token.slice(0, PROJECT_API_TOKEN_LENGTH),
    teamId: token.slice(PROJECT_API_TOKEN_LENGTH, PROJECT_API_TOKEN_LENGTH + TEAM_ID_LENGTH),
    projectIndex: Number(token.slice(PROJECT_API_TOKEN_LENGTH + TEAM_ID_LENGTH)),
  };
}

export default getTokenParts;
