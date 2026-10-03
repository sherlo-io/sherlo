/**
 * The calls `sherlo project list` makes, and the exact bytes they send.
 *
 * SAME HOUSE PATTERN AS ../projectCreate/createProjectRequest: raw fetch, not
 * `@sherlo/sdk-client`.
 *
 * TWO CALLS, NOT ONE. `listProjects: [ProjectSummary!]!` landed on the
 * `management-api-scopes-and-ops` epic branch
 * (packages/api/src/graphql/schema/resolvers/queries/listProjects.graphql)
 * with exactly four columns - `index`, `name`, `buildsCount`, `mainBranch` -
 * and DELIBERATELY no team info at all (a listing must never carry a
 * credential-shaped field, and team name isn't one, but it also isn't a
 * project fact). `render/projectList`'s `ProjectList.team.name` still needs a
 * real display name, so this module calls `listTeams` FIRST (the exact same
 * operation ../teamList/listTeamsRequest wires for `team list` - reused
 * wholesale, not a second bespoke lookup) to find the caller's own name for
 * `teamId`, and only then asks `listProjects` for the rows. A team that
 * doesn't turn up in `listTeams` - wrong id, or the token's owner isn't a
 * member - is refused right there; there is nothing useful to list for a team
 * the CLI cannot even name.
 *
 * `teamId` MUST still travel as a GraphQL VARIABLE on the `listProjects` call -
 * the personal-token authorizer reads the target team from
 * `requestContext.variables`, never from the query text, same as
 * `createProjectRequest`'s. `listTeams` takes no arguments at all - see
 * ../teamList/listTeamsRequest's header for why.
 *
 * LOAD-BEARING: the lambda authorizer reads the operation name off the FIRST
 * field of each whitespace-stripped query document - `listProjects` and
 * `listTeams` are ROUTING KEYS, not labels. Renaming either, or putting
 * another field before it, silently routes the request to deny-by-default.
 */
import fetch from 'node-fetch';
import type { ProjectList } from '../../render/projectList';
import listTeamsRequest, { ListTeamsAuthError } from '../teamList/listTeamsRequest';

/** Bounded so a hung endpoint cannot leave the command waiting forever. */
const REQUEST_TIMEOUT_MS = 30_000;

/** `query listProjects`. Has to stay the first selection - see the header above. */
const LIST_PROJECTS_QUERY = `
  query listProjects($teamId: String!) {
    listProjects(teamId: $teamId) {
      index
      name
      buildsCount
      mainBranch
    }
  }
`;

export class ListProjectsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ListProjectsAuthError';
  }
}

/**
 * The effects this request is made of, injected so a contract test can assert
 * the exact payload without a network. The default is the real thing. Also
 * what gets handed to `listTeamsRequest` for the lookup above - one fetch
 * client for both calls, real or faked.
 */
export type ListProjectsEffects = {
  fetch: typeof fetch;
  endpointUrl: () => string;
};

export const REAL_LIST_PROJECTS_EFFECTS: ListProjectsEffects = {
  fetch,
  endpointUrl: () => {
    const sdkEnv = require('@sherlo/sdk-client/dist/env.json');
    return process.env.SHERLO_API_URL ?? sdkEnv.endpoints.url;
  },
};

/** The api's own shape for one project summary, before it is narrowed to what is printed. */
type ApiProjectSummary = {
  index: number;
  name: string;
  buildsCount: number;
  mainBranch: string | null;
};

/**
 * List a team's projects, in the exact shape `render/projectList` prints.
 *
 * `personalToken` is used and discarded: it goes into the Authorization header
 * of both calls and nowhere else.
 */
async function listProjectsRequest(
  { teamId, personalToken }: { teamId: string; personalToken: string },
  effects: ListProjectsEffects = REAL_LIST_PROJECTS_EFFECTS
): Promise<ProjectList> {
  const { teams } = await listTeamsRequest({ personalToken }, effects).catch((error: Error) => {
    if (error instanceof ListTeamsAuthError) throw new ListProjectsAuthError(error.message);

    throw error;
  });

  const team = teams.find((candidate) => candidate.id === teamId);

  if (!team) {
    throw new Error(
      `Team \`${teamId}\` was not found among the teams this token's owner belongs to. ` +
        'Check the id, or list your teams with `sherlo team list`.'
    );
  }

  const response = await effects.fetch(effects.endpointUrl(), {
    method: 'POST',
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      Authorization: JSON.stringify({ authToken: personalToken }),
    },
    body: JSON.stringify({
      query: LIST_PROJECTS_QUERY,
      variables: { teamId },
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new ListProjectsAuthError(`HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as {
    data?: { listProjects?: ApiProjectSummary[] | null };
    errors?: { errorType?: string; message?: string }[];
  };

  if (json.errors?.length) {
    const isAuthError = json.errors.some((error) =>
      /unauthorized|forbidden|auth/i.test(error.errorType ?? '')
    );

    if (isAuthError) throw new ListProjectsAuthError('GraphQL authorization error');

    throw new Error(json.errors.map((error) => error.message ?? 'unknown error').join('; '));
  }

  const projects = json.data?.listProjects ?? [];

  return {
    team: { id: teamId, name: team.name },
    projects: projects.map((project) => ({
      index: project.index,
      name: project.name,
      buildCount: project.buildsCount,
      mainBranch: project.mainBranch,
    })),
  };
}

export default listProjectsRequest;
