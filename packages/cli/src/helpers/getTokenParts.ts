import { PROJECT_API_TOKEN_LENGTH, TEAM_ID_LENGTH } from '@sherlo/shared';
import refuseIfPersonalToken from './refuseIfPersonalToken';

/**
 * Take a PROJECT token apart into the three things it is made of.
 *
 * THIS IS A LEGACY-ONLY BRANCH NOW, and the word legacy is load-bearing. A
 * project token is a COMPOSITE the CLI can read without asking anyone: 32
 * random chars, an 8-char teamId, then the project index. That layout is why
 * `sherlo test` knows which team and project it is talking to before it makes a
 * single call - and it is also why the credential is not opaque, which every
 * credential minted from here on is.
 *
 * A PERSONAL TOKEN MUST NEVER REACH THIS FUNCTION. It carries no team and no
 * project; those facts are resolved server-side from the token's owner. Slicing
 * one anyway would not fail - it would SUCCEED, handing the caller eight
 * characters of random as a `teamId` and a `NaN` index, and the request would
 * go out addressed to a team that does not exist. So the personal shape is
 * refused here, by name, at the top: a wrong-credential mistake is worth an
 * error a person can act on, not a mis-addressed call.
 */
function getTokenParts(token: string): {
  apiToken: string;
  projectIndex: number;
  teamId: string;
} {
  refuseIfPersonalToken(token);

  return {
    apiToken: token.slice(0, PROJECT_API_TOKEN_LENGTH),
    teamId: token.slice(PROJECT_API_TOKEN_LENGTH, PROJECT_API_TOKEN_LENGTH + TEAM_ID_LENGTH),
    projectIndex: Number(token.slice(PROJECT_API_TOKEN_LENGTH + TEAM_ID_LENGTH)),
  };
}

export default getTokenParts;
