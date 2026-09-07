/**
 * Contract tests for the `createTeam` payload - the CLI -> api front door of
 * `sherlo team create`. Mirrors
 * ../../projectCreate/__tests__/createProjectRequest.contract.test.ts, minus
 * the teamId-as-variable assertion: this mutation has no team to name (see
 * ../createTeamRequest's header for why that is a real, currently-open gap).
 *
 * No network: the request's effects are injected.
 */
import { describe, expect, it, vi } from 'vitest';
import createTeamRequest, {
  CreateTeamAuthError,
  type CreateTeamEffects,
} from '../createTeamRequest';

const ENDPOINT = 'https://api.example.test/graphql';
const PERSONAL_TOKEN = 'sht_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const CREATED = { id: 'team1234', name: 'Acme' };

function effectsAnswering(
  response: unknown,
  status = 200
): CreateTeamEffects & { fetch: ReturnType<typeof vi.fn> } {
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

describe('createTeam payload', () => {
  it('sends only the name as a variable', async () => {
    const effects = effectsAnswering({ data: { createTeam: CREATED } });

    await createTeamRequest({ name: CREATED.name, personalToken: PERSONAL_TOKEN }, effects);

    const { body } = sentRequest(effects);

    expect(body.variables).toEqual({ name: CREATED.name });
  });

  it('names createTeam as the first field, which is how the authorizer routes it', async () => {
    const effects = effectsAnswering({ data: { createTeam: CREATED } });

    await createTeamRequest({ name: CREATED.name, personalToken: PERSONAL_TOKEN }, effects);

    const { body } = sentRequest(effects);
    const firstField = body.query.replace(/\s+/g, '').match(/{(\w+)\(/)?.[1];

    expect(firstField).toBe('createTeam');
  });

  it('carries the personal token in the Authorization envelope and in nothing else', async () => {
    const effects = effectsAnswering({ data: { createTeam: CREATED } });

    await createTeamRequest({ name: CREATED.name, personalToken: PERSONAL_TOKEN }, effects);

    const { init, body } = sentRequest(effects);

    expect(JSON.parse(init.headers.Authorization)).toEqual({ authToken: PERSONAL_TOKEN });
    expect(JSON.stringify(body)).not.toContain(PERSONAL_TOKEN);
  });
});

describe('createTeam response', () => {
  it('answers exactly the two fields the CLI prints, dropping anything else', async () => {
    const effects = effectsAnswering({
      data: { createTeam: { ...CREATED, ownerUserId: 'u1', inviteToken: 'LEAK' } },
    });

    const team = await createTeamRequest(
      { name: CREATED.name, personalToken: PERSONAL_TOKEN },
      effects
    );

    expect(team).toEqual(CREATED);
    expect(Object.keys(team)).toEqual(['id', 'name']);
  });

  it('refuses a response with no team rather than printing an absent id', async () => {
    const effects = effectsAnswering({ data: { createTeam: null } });

    await expect(
      createTeamRequest({ name: CREATED.name, personalToken: PERSONAL_TOKEN }, effects)
    ).rejects.toThrow(/answered without the team/);
  });

  it('maps a 401 to an auth error so the command can name the credential', async () => {
    const effects = effectsAnswering({}, 401);

    await expect(
      createTeamRequest({ name: CREATED.name, personalToken: PERSONAL_TOKEN }, effects)
    ).rejects.toBeInstanceOf(CreateTeamAuthError);
  });

  it("passes a non-auth GraphQL error through in the api's own words", async () => {
    const effects = effectsAnswering({
      errors: [{ errorType: 'BadRequest', message: 'createTeam:tooLongName' }],
    });

    await expect(
      createTeamRequest({ name: CREATED.name, personalToken: PERSONAL_TOKEN }, effects)
    ).rejects.toThrow('createTeam:tooLongName');
  });
});
