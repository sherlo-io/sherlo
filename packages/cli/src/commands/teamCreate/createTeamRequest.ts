/**
 * The ONE call `sherlo team create` makes, and the exact bytes it sends.
 *
 * SAME HOUSE PATTERN AS ../projectCreate/createProjectRequest: raw fetch, not
 * `@sherlo/sdk-client`.
 *
 * `createTeam(name: String!): Team` landed `@aws_lambda` on the
 * `management-api-scopes-and-ops` epic branch, carrying `team:write` - the
 * scope this operation names no `teamId` variable for, and deliberately: the
 * team it creates doesn't exist yet, so there is nothing to check the
 * caller's role against. `REQUIRED_TEAM_ROLE_BY_SCOPE` puts `team:write` on
 * plain "user" standing for exactly that reason
 * (authorizers/personalTokenPolicy.ts) - the same shape `team:read` gets for
 * `listTeams` (../teamList/listTeamsRequest). The document and field
 * selection below were already an exact match for the schema before this
 * landed; only the authorization was missing, and this module needed no
 * change once it did.
 */
import fetch from 'node-fetch';
import type { TeamCreated } from '../../render/teamCreated';

/** Bounded so a hung endpoint cannot leave the command waiting forever. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * `mutation createTeam`.
 *
 * `createTeam` has to stay the first selection: the api routes on the first
 * `{word(` of the whitespace-stripped document, same as every other operation
 * in this family.
 */
const CREATE_TEAM_MUTATION = `
  mutation createTeam($name: String!) {
    createTeam(name: $name) {
      id
      name
    }
  }
`;

export class CreateTeamAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreateTeamAuthError';
  }
}

/**
 * The effects this request is made of, injected so a contract test can assert
 * the exact payload without a network. The default is the real thing.
 */
export type CreateTeamEffects = {
  fetch: typeof fetch;
  endpointUrl: () => string;
};

export const REAL_CREATE_TEAM_EFFECTS: CreateTeamEffects = {
  fetch,
  endpointUrl: () => {
    const sdkEnv = require('@sherlo/sdk-client/dist/env.json');
    return process.env.SHERLO_API_URL ?? sdkEnv.endpoints.url;
  },
};

/**
 * Create the team and answer the two fields the CLI prints.
 *
 * `personalToken` is used and discarded: it goes into the Authorization header
 * and nowhere else.
 */
async function createTeamRequest(
  { name, personalToken }: { name: string; personalToken: string },
  effects: CreateTeamEffects = REAL_CREATE_TEAM_EFFECTS
): Promise<TeamCreated> {
  const response = await effects.fetch(effects.endpointUrl(), {
    method: 'POST',
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      Authorization: JSON.stringify({ authToken: personalToken }),
    },
    body: JSON.stringify({
      query: CREATE_TEAM_MUTATION,
      variables: { name },
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new CreateTeamAuthError(`HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as {
    data?: { createTeam?: Partial<TeamCreated> | null };
    errors?: { errorType?: string; message?: string }[];
  };

  if (json.errors?.length) {
    const isAuthError = json.errors.some((error) =>
      /unauthorized|forbidden|auth/i.test(error.errorType ?? '')
    );

    if (isAuthError) throw new CreateTeamAuthError('GraphQL authorization error');

    throw new Error(json.errors.map((error) => error.message ?? 'unknown error').join('; '));
  }

  const team = json.data?.createTeam;

  if (!team?.name || !team.id) {
    throw new Error(
      'The API answered without the team it created. Check the Sherlo web app before ' +
        'retrying - a team may exist whose id was never shown.'
    );
  }

  return { name: team.name, id: team.id };
}

export default createTeamRequest;
