/**
 * Contract tests for the `listTeams` payload - the CLI -> api front door of
 * `sherlo team list`. No `teamId` here: `listTeams` is account-scoped, not
 * team-scoped, answered from the caller's own memberships - see
 * ../listTeamsRequest's header.
 *
 * No network: the request's effects are injected.
 */
import { describe, expect, it, vi } from 'vitest';
import listTeamsRequest, { ListTeamsAuthError, type ListTeamsEffects } from '../listTeamsRequest';

const ENDPOINT = 'https://api.example.test/graphql';
const PERSONAL_TOKEN = 'sht_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const TEAMS = [
  { id: 'team1234', name: 'Acme', role: 'owner', projectsCount: 2 },
  { id: 'team5678', name: 'Solo Co', role: 'member', projectsCount: 0 },
];

function effectsAnswering(
  response: unknown,
  status = 200
): ListTeamsEffects & { fetch: ReturnType<typeof vi.fn> } {
  const fetchSpy = vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    statusText: 'OK',
    json: async () => response,
  });

  return { fetch: fetchSpy as never, endpointUrl: () => ENDPOINT } as never;
}

/** The single request the function made, parsed. */
function sentRequest(effects: { fetch: ReturnType<typeof vi.fn> }) {
  const [url, init] = effects.fetch.mock.calls[0];
  return { url, init, body: JSON.parse(init.body as string) };
}

describe('listTeams payload', () => {
  it('sends no variables - this operation is account-scoped, not team-scoped', async () => {
    const effects = effectsAnswering({ data: { listTeams: TEAMS } });

    await listTeamsRequest({ personalToken: PERSONAL_TOKEN }, effects);

    const { body } = sentRequest(effects);

    expect(body.variables).toBeUndefined();
  });

  it('names listTeams as the first field, which is how the authorizer routes it', async () => {
    const effects = effectsAnswering({ data: { listTeams: TEAMS } });

    await listTeamsRequest({ personalToken: PERSONAL_TOKEN }, effects);

    const { body } = sentRequest(effects);
    const firstField = body.query.replace(/\s+/g, '').match(/{(\w+){/)?.[1];

    expect(firstField).toBe('listTeams');
  });

  it('carries the personal token in the Authorization envelope and in nothing else', async () => {
    const effects = effectsAnswering({ data: { listTeams: TEAMS } });

    await listTeamsRequest({ personalToken: PERSONAL_TOKEN }, effects);

    const { init, body } = sentRequest(effects);

    expect(JSON.parse(init.headers.Authorization)).toEqual({ authToken: PERSONAL_TOKEN });
    expect(JSON.stringify(body)).not.toContain(PERSONAL_TOKEN);
  });
});

describe('listTeams response', () => {
  it(
    "maps the api shape to what render/teamList prints, with the caller's own non-null role",
    async () => {
      const effects = effectsAnswering({ data: { listTeams: TEAMS } });

      const list = await listTeamsRequest({ personalToken: PERSONAL_TOKEN }, effects);

      expect(list).toEqual({
        teams: [
          { id: 'team1234', name: 'Acme', projectCount: 2, role: 'owner' },
          { id: 'team5678', name: 'Solo Co', projectCount: 0, role: 'member' },
        ],
      });
    }
  );

  it('uses projectsCount directly rather than counting a nested list', async () => {
    // No `projects` array in the response at all - `listTeams` never sends one;
    // a mapping that still reached for `team.projects.length` would throw here.
    const effects = effectsAnswering({
      data: { listTeams: [{ id: 'team1234', name: 'Acme', role: 'owner', projectsCount: 5 }] },
    });

    const list = await listTeamsRequest({ personalToken: PERSONAL_TOKEN }, effects);

    expect(list.teams[0].projectCount).toBe(5);
  });

  it('answers an empty list rather than refusing when the caller belongs to no team', async () => {
    const effects = effectsAnswering({ data: { listTeams: [] } });

    const list = await listTeamsRequest({ personalToken: PERSONAL_TOKEN }, effects);

    expect(list.teams).toEqual([]);
  });

  it('treats a null listTeams the same as an empty list', async () => {
    const effects = effectsAnswering({ data: { listTeams: null } });

    const list = await listTeamsRequest({ personalToken: PERSONAL_TOKEN }, effects);

    expect(list.teams).toEqual([]);
  });

  it('maps a 401 to an auth error so the command can name the credential', async () => {
    const effects = effectsAnswering({}, 401);

    await expect(
      listTeamsRequest({ personalToken: PERSONAL_TOKEN }, effects)
    ).rejects.toBeInstanceOf(ListTeamsAuthError);
  });

  it("passes a non-auth GraphQL error through in the api's own words", async () => {
    const effects = effectsAnswering({
      errors: [{ errorType: 'InternalError', message: 'listTeams:unexpectedError' }],
    });

    await expect(listTeamsRequest({ personalToken: PERSONAL_TOKEN }, effects)).rejects.toThrow(
      'listTeams:unexpectedError'
    );
  });
});
