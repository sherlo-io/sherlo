/**
 * Contract tests for the `createProject` payload - the CLI -> api front door of
 * `sherlo project create`.
 *
 * Two properties are pinned here and they are not the same kind of thing:
 *
 *  1. THE WIRE SHAPE, in the house style of openBuildPayload.contract.test.ts.
 *     The load-bearing part is that `teamId` travels as a GraphQL VARIABLE: the
 *     api's personal-token authorizer reads the team it checks the caller's
 *     role against out of `requestContext.variables`, so a document that inlines
 *     the argument is denied - with a message indistinguishable from a bad
 *     token. That is a mistake a future "tidy the query" edit would make
 *     silently, so it is asserted rather than commented.
 *
 *  2. WHAT THE RESPONSE IS ALLOWED TO BECOME. `createProject` answers with a
 *     plaintext credential; the function must hand back three named fields and
 *     drop everything else, so an api field added tomorrow cannot ride into a
 *     caller (and from there into a CI log) without someone deciding it should.
 *
 * No network: the request's effects are injected.
 */
import { describe, expect, it, vi } from 'vitest';
import createProjectRequest, {
  CreateProjectAuthError,
  type CreateProjectEffects,
} from '../createProjectRequest';

const ENDPOINT = 'https://api.example.test/graphql';
const PERSONAL_TOKEN = 'sht_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const CREATED = {
  name: 'Design System',
  index: 12,
  projectToken: 'p'.repeat(32) + 'team1234' + '12',
};

function effectsAnswering(
  response: unknown,
  status = 200
): CreateProjectEffects & { fetch: ReturnType<typeof vi.fn> } {
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

describe('createProject payload', () => {
  it('sends teamId as a GraphQL VARIABLE and never inlines it into the query', async () => {
    const effects = effectsAnswering({ data: { createProject: CREATED } });

    await createProjectRequest(
      { name: CREATED.name, teamId: 'team1234', personalToken: PERSONAL_TOKEN },
      effects
    );

    const { body } = sentRequest(effects);

    expect(body.variables).toEqual({ name: CREATED.name, teamId: 'team1234' });
    // The team id appears in the variables and NOWHERE in the document text.
    expect(body.query).not.toContain('team1234');
    expect(body.query).toContain('$teamId: String!');
  });

  it('names createProject as the first field, which is how the authorizer routes it', () => {
    // The api extracts the operation from the first `{word(` of the
    // whitespace-stripped document; anything else routes to deny-by-default.
    const effects = effectsAnswering({ data: { createProject: CREATED } });

    return createProjectRequest(
      { name: CREATED.name, teamId: 'team1234', personalToken: PERSONAL_TOKEN },
      effects
    ).then(() => {
      const { body } = sentRequest(effects);
      const firstField = body.query.replace(/\s+/g, '').match(/{(\w+)\(/)?.[1];

      expect(firstField).toBe('createProject');
    });
  });

  it('selects only the three fields it prints - never apiTokenHash', async () => {
    const effects = effectsAnswering({ data: { createProject: CREATED } });

    await createProjectRequest(
      { name: CREATED.name, teamId: 'team1234', personalToken: PERSONAL_TOKEN },
      effects
    );

    const { body } = sentRequest(effects);

    expect(body.query).toContain('projectToken');
    expect(body.query).not.toContain('apiTokenHash');
  });

  it('carries the personal token in the Authorization envelope and in nothing else', async () => {
    const effects = effectsAnswering({ data: { createProject: CREATED } });

    await createProjectRequest(
      { name: CREATED.name, teamId: 'team1234', personalToken: PERSONAL_TOKEN },
      effects
    );

    const { init, body } = sentRequest(effects);

    expect(JSON.parse(init.headers.Authorization)).toEqual({ authToken: PERSONAL_TOKEN });
    expect(JSON.stringify(body)).not.toContain(PERSONAL_TOKEN);
  });
});

describe('createProject response', () => {
  it('answers exactly the three fields the CLI prints, dropping anything else', async () => {
    const effects = effectsAnswering({
      data: { createProject: { ...CREATED, apiTokenHash: 'LEAK', teamId: 'team1234' } },
    });

    const project = await createProjectRequest(
      { name: CREATED.name, teamId: 'team1234', personalToken: PERSONAL_TOKEN },
      effects
    );

    expect(project).toEqual(CREATED);
    expect(Object.keys(project)).toEqual(['name', 'index', 'projectToken']);
  });

  it('refuses a response with no project rather than printing an absent token', async () => {
    const effects = effectsAnswering({ data: { createProject: null } });

    await expect(
      createProjectRequest(
        { name: CREATED.name, teamId: 'team1234', personalToken: PERSONAL_TOKEN },
        effects
      )
    ).rejects.toThrow(/answered without the project/);
  });

  it('maps a 401 to an auth error so the command can name the credential', async () => {
    const effects = effectsAnswering({}, 401);

    await expect(
      createProjectRequest(
        { name: CREATED.name, teamId: 'team1234', personalToken: PERSONAL_TOKEN },
        effects
      )
    ).rejects.toBeInstanceOf(CreateProjectAuthError);
  });

  it("passes a non-auth GraphQL error through in the api's own words", async () => {
    const effects = effectsAnswering({
      errors: [{ errorType: 'BadRequest', message: 'createProject:tooLongName' }],
    });

    await expect(
      createProjectRequest(
        { name: CREATED.name, teamId: 'team1234', personalToken: PERSONAL_TOKEN },
        effects
      )
    ).rejects.toThrow('createProject:tooLongName');
  });
});
