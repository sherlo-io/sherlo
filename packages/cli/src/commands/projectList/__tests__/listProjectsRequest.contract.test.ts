/**
 * Contract tests for `sherlo project list`'s TWO calls - `listTeams` (to find
 * the caller's own display name for `teamId`) then `listProjects` (the rows) -
 * see ../listProjectsRequest's header for why there are two.
 *
 * The fetch mock below routes on the OUTGOING QUERY TEXT rather than call
 * order, since which query names which operation is exactly the fact several
 * of these tests are pinning.
 *
 * No network: the request's effects are injected.
 */
import { describe, expect, it, vi } from 'vitest';
import listProjectsRequest, {
  ListProjectsAuthError,
  type ListProjectsEffects,
} from '../listProjectsRequest';

const ENDPOINT = 'https://api.example.test/graphql';
const PERSONAL_TOKEN = 'sht_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TEAM_ID = 'team1234';

const TEAMS = [
  { id: TEAM_ID, name: 'Acme', role: 'owner', projectsCount: 2 },
  { id: 'team5678', name: 'Solo Co', role: 'member', projectsCount: 0 },
];

const PROJECTS = [
  { index: 0, name: 'Design System', buildsCount: 12, mainBranch: 'main' },
  { index: 1, name: 'Marketing Site', buildsCount: 0, mainBranch: null },
];

type Canned = { status?: number; body: unknown };

/**
 * A fetch mock answering the `listTeams` and `listProjects` calls separately,
 * picked by which operation name appears in the outgoing query text.
 */
function effectsAnswering({
  listTeams,
  listProjects,
}: {
  listTeams: Canned;
  listProjects?: Canned;
}): ListProjectsEffects & { fetch: ReturnType<typeof vi.fn> } {
  const fetchSpy = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
    const parsedBody = JSON.parse(init.body);
    const isListTeams = /\blistTeams\b/.test(parsedBody.query);
    const canned = isListTeams ? listTeams : listProjects;

    if (!canned) throw new Error('listProjects was called but no canned response was given');

    const status = canned.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      statusText: 'OK',
      json: async () => canned.body,
    };
  });

  return { fetch: fetchSpy as never, endpointUrl: () => ENDPOINT } as never;
}

/** The Nth request the function made, parsed. */
function requestAt(effects: { fetch: ReturnType<typeof vi.fn> }, index: number) {
  const [url, init] = effects.fetch.mock.calls[index];
  return { url, init, body: JSON.parse(init.body as string) };
}

describe('the listTeams lookup', () => {
  it('is called first, with no variables', async () => {
    const effects = effectsAnswering({
      listTeams: { body: { data: { listTeams: TEAMS } } },
      listProjects: { body: { data: { listProjects: PROJECTS } } },
    });

    await listProjectsRequest({ teamId: TEAM_ID, personalToken: PERSONAL_TOKEN }, effects);

    const { body } = requestAt(effects, 0);
    expect(body.variables).toBeUndefined();
    const firstField = body.query.replace(/\s+/g, '').match(/{(\w+){/)?.[1];
    expect(firstField).toBe('listTeams');
  });

  it(
    "refuses when teamId is not among the caller's teams, WITHOUT calling listProjects at all",
    async () => {
      const effects = effectsAnswering({ listTeams: { body: { data: { listTeams: TEAMS } } } });

      await expect(
        listProjectsRequest({ teamId: 'unknown-team', personalToken: PERSONAL_TOKEN }, effects)
      ).rejects.toThrow(/was not found among the teams/);

      expect(effects.fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('maps a 401 on the listTeams call to an auth error', async () => {
    const effects = effectsAnswering({ listTeams: { status: 401, body: {} } });

    await expect(
      listProjectsRequest({ teamId: TEAM_ID, personalToken: PERSONAL_TOKEN }, effects)
    ).rejects.toBeInstanceOf(ListProjectsAuthError);
  });
});

describe('the listProjects call', () => {
  it('sends teamId as a GraphQL VARIABLE and never inlines it into the query', async () => {
    const effects = effectsAnswering({
      listTeams: { body: { data: { listTeams: TEAMS } } },
      listProjects: { body: { data: { listProjects: PROJECTS } } },
    });

    await listProjectsRequest({ teamId: TEAM_ID, personalToken: PERSONAL_TOKEN }, effects);

    const { body } = requestAt(effects, 1);
    expect(body.variables).toEqual({ teamId: TEAM_ID });
    expect(body.query).not.toContain(TEAM_ID);
    expect(body.query).toContain('$teamId: String!');
    const firstField = body.query.replace(/\s+/g, '').match(/{(\w+)\(/)?.[1];
    expect(firstField).toBe('listProjects');
  });

  it(
    'carries the personal token in the Authorization envelope of BOTH calls, and in nothing else',
    async () => {
      const effects = effectsAnswering({
        listTeams: { body: { data: { listTeams: TEAMS } } },
        listProjects: { body: { data: { listProjects: PROJECTS } } },
      });

      await listProjectsRequest({ teamId: TEAM_ID, personalToken: PERSONAL_TOKEN }, effects);

      for (const index of [0, 1]) {
        const { init, body } = requestAt(effects, index);
        expect(JSON.parse(init.headers.Authorization)).toEqual({ authToken: PERSONAL_TOKEN });
        expect(JSON.stringify(body)).not.toContain(PERSONAL_TOKEN);
      }
    }
  );

  it('maps a 401 on the listProjects call to an auth error', async () => {
    const effects = effectsAnswering({
      listTeams: { body: { data: { listTeams: TEAMS } } },
      listProjects: { status: 401, body: {} },
    });

    await expect(
      listProjectsRequest({ teamId: TEAM_ID, personalToken: PERSONAL_TOKEN }, effects)
    ).rejects.toBeInstanceOf(ListProjectsAuthError);
  });

  it("passes a non-auth GraphQL error through in the api's own words", async () => {
    const graphqlError = { errorType: 'BadRequest', message: 'listProjects:unknownTeam' };
    const effects = effectsAnswering({
      listTeams: { body: { data: { listTeams: TEAMS } } },
      listProjects: { body: { errors: [graphqlError] } },
    });

    await expect(
      listProjectsRequest({ teamId: TEAM_ID, personalToken: PERSONAL_TOKEN }, effects)
    ).rejects.toThrow('listProjects:unknownTeam');
  });
});

describe('the combined response', () => {
  it('takes team.name from the listTeams match and team.id from the input teamId', async () => {
    const effects = effectsAnswering({
      listTeams: { body: { data: { listTeams: TEAMS } } },
      listProjects: { body: { data: { listProjects: PROJECTS } } },
    });

    const list = await listProjectsRequest(
      { teamId: TEAM_ID, personalToken: PERSONAL_TOKEN },
      effects
    );

    expect(list).toEqual({
      team: { id: TEAM_ID, name: 'Acme' },
      projects: [
        { index: 0, name: 'Design System', buildCount: 12, mainBranch: 'main' },
        { index: 1, name: 'Marketing Site', buildCount: 0, mainBranch: null },
      ],
    });
  });

  it('answers an empty list rather than refusing when the team has no projects yet', async () => {
    const effects = effectsAnswering({
      listTeams: { body: { data: { listTeams: TEAMS } } },
      listProjects: { body: { data: { listProjects: [] } } },
    });

    const list = await listProjectsRequest(
      { teamId: TEAM_ID, personalToken: PERSONAL_TOKEN },
      effects
    );

    expect(list.projects).toEqual([]);
  });
});
