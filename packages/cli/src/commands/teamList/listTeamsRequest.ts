/**
 * The ONE call `sherlo team list` makes, and the exact bytes it sends.
 *
 * SAME HOUSE PATTERN AS ../projectCreate/createProjectRequest: raw fetch, not
 * `@sherlo/sdk-client`.
 *
 * `listTeams: [TeamSummary!]!` landed on the `management-api-scopes-and-ops`
 * epic branch (packages/api/src/graphql/schema/resolvers/queries/listTeams.graphql)
 * with `@aws_lambda` and a `team:read` scope, closing both gaps an earlier
 * version of this module flagged: it takes NO ARGUMENTS (it is account-scoped,
 * answered from the caller's own memberships - there is no team to check a
 * role against, so `_personalTokenAuthorizer.ts`'s usual `teamId`-variable
 * requirement does not apply to it), and `TeamSummary.role` is the CALLER's
 * OWN role, answered directly and never null.
 *
 * LOAD-BEARING: the lambda authorizer reads the operation name off the FIRST
 * field of the whitespace-stripped query document - `listTeams` is a ROUTING
 * KEY, not a label. Renaming it, or putting another field before it, silently
 * routes the request to deny-by-default.
 */
import fetch from 'node-fetch';
import type { TeamList } from '../../render/teamList';

/** Bounded so a hung endpoint cannot leave the command waiting forever. */
const REQUEST_TIMEOUT_MS = 30_000;

/** `query listTeams`. Has to stay the first (and only) selection - see the header above. */
const LIST_TEAMS_QUERY = `
  query listTeams {
    listTeams {
      id
      name
      role
      projectsCount
    }
  }
`;

export class ListTeamsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ListTeamsAuthError';
  }
}

/**
 * The effects this request is made of, injected so a contract test can assert
 * the exact payload without a network. The default is the real thing.
 */
export type ListTeamsEffects = {
  fetch: typeof fetch;
  endpointUrl: () => string;
};

export const REAL_LIST_TEAMS_EFFECTS: ListTeamsEffects = {
  fetch,
  endpointUrl: () => {
    const sdkEnv = require('@sherlo/sdk-client/dist/env.json');
    return process.env.SHERLO_API_URL ?? sdkEnv.endpoints.url;
  },
};

/** The api's own shape for one team summary, before it is narrowed to what is printed. */
type ApiTeamSummary = { id: string; name: string; role: string; projectsCount: number };

/**
 * List the caller's teams, in the exact shape `render/teamList` prints.
 *
 * `personalToken` is used and discarded: it goes into the Authorization header
 * and nowhere else.
 */
async function listTeamsRequest(
  { personalToken }: { personalToken: string },
  effects: ListTeamsEffects = REAL_LIST_TEAMS_EFFECTS
): Promise<TeamList> {
  const response = await effects.fetch(effects.endpointUrl(), {
    method: 'POST',
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      Authorization: JSON.stringify({ authToken: personalToken }),
    },
    body: JSON.stringify({ query: LIST_TEAMS_QUERY }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new ListTeamsAuthError(`HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as {
    data?: { listTeams?: ApiTeamSummary[] | null };
    errors?: { errorType?: string; message?: string }[];
  };

  if (json.errors?.length) {
    const isAuthError = json.errors.some((error) =>
      /unauthorized|forbidden|auth/i.test(error.errorType ?? '')
    );

    if (isAuthError) throw new ListTeamsAuthError('GraphQL authorization error');

    throw new Error(json.errors.map((error) => error.message ?? 'unknown error').join('; '));
  }

  const teams = json.data?.listTeams ?? [];

  return {
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      projectCount: team.projectsCount,
      role: team.role,
    })),
  };
}

export default listTeamsRequest;
