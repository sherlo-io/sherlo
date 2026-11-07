/**
 * The requests a captured story made that no rule answered, listed with their method and address
 * so an agent can write the missing mockRequest rules. The story's error keeps only the last
 * refusal; a request let through, and every request of a story with no network mock, was seen by
 * nothing before.
 */
const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import { clearStoryError, readStoryError } from '../../getStorybook/storyErrorRegistry';
import { mockRequest } from '../../mocking/networkDeclaration';
import { socketVerdictFor, unansweredRequests } from '../../mocking/networkRules';
import type { RefusedRequest } from '../../mocking/refusedRequest';
import {
  __resetProviderFirstRenderedAtForTests,
  rememberAppMetadataCollector,
} from '../../appMetadata';
import { clearMocks } from '../../mocking/registry';
import type { StoryMocks } from '../../mocking/mockDeclaration';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { startStorybookHolding } from './storybookHolding';

const BASE = 'https://mocking.sherlo.invalid';
const STORY_ID = 'mocking-unanswered--default';

const realFetch = globalThis.fetch;
const globals = globalThis as unknown as { fetch: typeof fetch };
const network = vi.fn(async () => new Response('from the network'));

// A bundle the bundler served, as a capture's is: the polyfill's watcher says it is a capture
// whenever the app runs in testing mode (metro/polyfill.js `isCapture`).
const captureWatcher = {
  isTesting: true,
  isCapture: () => mockGetMode() === 'testing',
  startStory: () => {},
  readStory: () => [],
};

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
  (globalThis as { __sherloStillReal?: unknown }).__sherloStillReal = captureWatcher;
  globals.fetch = network as unknown as typeof fetch;
});

afterEach(() => {
  delete (globalThis as { __sherloStillReal?: unknown }).__sherloStillReal;
  clearMocks();
  clearStoryError(STORY_ID);
  globals.fetch = realFetch;
  __resetStorybookFactsForTests();
  __resetProviderFirstRenderedAtForTests();
  rememberAppMetadataCollector(undefined);
  vi.clearAllMocks();
});

async function activateStory(story: StoryMocks): Promise<void> {
  startStorybookHolding(
    [
      {
        importPath: './src/Unanswered.stories.tsx',
        title: 'Mocking/Unanswered',
        fileExports: {
          default: { title: 'Mocking/Unanswered' },
          Default: { parameters: { sherlo: { mocks: story } } },
        },
        stories: [{ id: STORY_ID, name: 'Default' }],
      },
    ],
    undefined
  );
  await activateMocksForStory(STORY_ID);
}

// What a refusal made before the app first rendered also carries.
const refusedAtLaunch = {
  scope: 'background',
  rule: 'no-fake-matched',
  stack: expect.any(String),
};

describe('the requests no rule answered', () => {
  it("a refused request made while the scene's screen loads is marked as the screen's own", async () => {
    await activateStory([mockRequest({ url: `${BASE}/known` }, { body: 'known' })]);
    rememberAppMetadataCollector(() => undefined);

    await fetch(`${BASE}/profile`).catch(() => {});

    expect(unansweredRequests()).toEqual([
      { method: 'GET', url: `${BASE}/profile`, ...refusedAtLaunch, scope: 'screen' },
    ]);
  });

  it('a refused request from a library started at app launch is marked background', async () => {
    await activateStory([mockRequest({ url: `${BASE}/known` }, { body: 'known' })]);

    // Before the app's first render: a service the app starts at launch asks for its host.
    await fetch('https://sdk.vendor.invalid/config').catch(() => {});

    expect(unansweredRequests()[0]).toMatchObject({ scope: 'background' });
    expect(unansweredRequests()[0].stack).toContain('networkFetch');
  });

  it('a refusal keeps no more than twenty lines of the call stack', async () => {
    await activateStory([mockRequest({ url: `${BASE}/known` }, { body: 'known' })]);
    const deep = async (depth: number): Promise<void> => {
      if (depth > 0) return deep(depth - 1);
      await fetch(`${BASE}/orders`).catch(() => {});
    };
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 80;

    await deep(40);
    Error.stackTraceLimit = limit;

    expect((unansweredRequests()[0].stack ?? '').split('\n').length).toBeLessThanOrEqual(20);
  });

  it('each refusal names the rule that blocked it: no fake matched, or a fake that refuses', async () => {
    await activateStory([
      mockRequest({ url: `${BASE}/known` }, { body: 'known' }),
      mockRequest.socket({ url: 'wss://live.example.invalid/*' }, 'refuse'),
    ]);

    await fetch(`${BASE}/orders`).catch(() => {});
    socketVerdictFor('wss://live.example.invalid/feed');

    const [unmatched, refusedByFake]: RefusedRequest[] = unansweredRequests();
    expect(unmatched.rule).toBe('no-fake-matched');
    expect(refusedByFake).toMatchObject({
      method: 'WS',
      url: 'wss://live.example.invalid/feed',
      rule: 'fake-refused',
    });
    // The fake's own line, so the Mac can say where it was declared.
    expect(refusedByFake.fakeAt).toContain('unansweredRequests.test');
  });

  it('every request no rule answered is listed with its method and address, in the order made', async () => {
    await activateStory([
      mockRequest({ url: `${BASE}/profile` }, { body: 'the profile' }),
      mockRequest({ url: `${BASE}/flags*` }, { body: 'passthrough off' }),
    ]);

    await fetch(`${BASE}/profile`);
    await fetch(`${BASE}/orders`).catch(() => {});
    await fetch(`${BASE}/graphql`, { method: 'POST', body: '{}' }).catch(() => {});
    await fetch(`${BASE}/orders`).catch(() => {});

    // The story's error keeps one refusal, the last; the list keeps all of them.
    expect(readStoryError(STORY_ID)?.message).toBe(
      `no mock rule matches GET ${BASE}/orders. Add a rule for it, or let it through.`
    );
    expect(unansweredRequests()).toEqual([
      { method: 'GET', url: `${BASE}/orders`, ...refusedAtLaunch },
      { method: 'POST', url: `${BASE}/graphql`, ...refusedAtLaunch },
      { method: 'GET', url: `${BASE}/orders`, ...refusedAtLaunch },
    ]);
  });

  it('an unanswered request keeps its content type and a body excerpt', async () => {
    await activateStory([mockRequest({ url: `${BASE}/known` }, { body: 'known' })]);

    await fetch(`${BASE}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationName: 'Orders',
        query: '{ o }',
        variables: { first: 5, e: 'a@b.c' },
      }),
    }).catch(() => {});

    expect(unansweredRequests()).toEqual([
      {
        method: 'POST',
        url: `${BASE}/graphql`,
        contentType: 'application/json',
        operation: 'Orders',
        ...refusedAtLaunch,
        bodyExcerpt:
          '{"operationName":"Orders","query":"{ o }","variables":{"first":5,"e":"<text>"}}',
      },
    ]);
  });

  it('a persisted GraphQL query sent by GET is named by its hash', async () => {
    await activateStory([mockRequest({ url: `${BASE}/known` }, { body: 'known' })]);
    const hash = 'abcdef0123456789abcdef';
    const extensions = encodeURIComponent(JSON.stringify({ persistedQuery: { sha256Hash: hash } }));
    const url = `${BASE}/graphql?extensions=${extensions}`;

    await fetch(url).catch(() => {});

    expect(unansweredRequests()).toEqual([
      { method: 'GET', url, operation: 'persisted abcdef012345', ...refusedAtLaunch },
    ]);
  });

  it('a password in a JSON or form body never reaches the record', async () => {
    await activateStory([mockRequest({ url: `${BASE}/known` }, { body: 'known' })]);

    await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: { password: 'hunter2-json' }, remember: true }),
    }).catch(() => {});
    await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=hunter2-form&remember=true',
    }).catch(() => {});

    expect(JSON.stringify(unansweredRequests())).not.toContain('hunter2');
    expect(unansweredRequests().map((request) => request.bodyExcerpt)).toEqual([
      '{"user":{"password":"<text>"},"remember":true}',
      'password=<text>&remember=true',
    ]);
  });

  it('a story with no network mock still lists the requests it made', async () => {
    await activateStory([]);

    await expect((await fetch(`${BASE}/flags`)).text()).resolves.toBe('from the network');
    await fetch(`${BASE}/orders`);

    expect(readStoryError(STORY_ID)).toBeUndefined();
    expect(unansweredRequests()).toEqual([
      { method: 'GET', url: `${BASE}/flags` },
      { method: 'GET', url: `${BASE}/orders` },
    ]);
  });

  it('a request let through is listed, and the next story starts with an empty list', async () => {
    await activateStory([mockRequest.passthrough()]);
    await fetch(`${BASE}/flags`);
    expect(unansweredRequests()).toEqual([{ method: 'GET', url: `${BASE}/flags` }]);

    await activateStory([mockRequest.passthrough()]);

    expect(unansweredRequests()).toEqual([]);
  });

  it("outside a capture a story with no network mock runs on the app's own fetch", async () => {
    mockGetMode.mockReturnValue('storybook');

    await activateStory([]);

    expect(globals.fetch).toBe(network);
  });
});
