/**
 * SPIKE still-real-list: the requests a story made that no rule answered, listed for the capture
 * so an agent can write the missing mockRequest rules one by one.
 *
 * Today a refused request is recorded as the story's error, and only the last one survives; a
 * passthrough request, and every request of a story that declares no network mock, is seen by
 * nothing. The list below names each request once, with its method, its address and - for a
 * GraphQL request, where every request is POST /graphql - its operation name.
 */
const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import {
  activateMocksForStory,
  unansweredRequestsOfStory,
} from '../../getStorybook/storyMockActivation';
import { clearStoryError, readStoryError } from '../../getStorybook/storyErrorRegistry';
import { mockRequest } from '../../mocking/networkDeclaration';
import { listenToRequests } from '../../mocking/network';
import { clearMocks } from '../../mocking/registry';
import type { StoryMocks } from '../../mocking/mockDeclaration';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { startStorybookHolding } from './storybookHolding';

const BASE = 'https://mocking.sherlo.invalid';
const STORY_ID = 'mocking-unanswered--default';

const realFetch = globalThis.fetch;
const globals = globalThis as unknown as { fetch: typeof fetch };
const network = vi.fn(async () => new Response('from the network'));

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
  globals.fetch = network as unknown as typeof fetch;
});

afterEach(() => {
  listenToRequests(false);
  clearMocks();
  clearStoryError(STORY_ID);
  globals.fetch = realFetch;
  __resetStorybookFactsForTests();
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

const graphql = (operationName: string) => ({
  method: 'POST',
  body: JSON.stringify({ operationName, query: `query ${operationName} { x }` }),
});

describe('the requests no rule answered', () => {
  it('a refused story lists every refused request, not only the last one its error keeps', async () => {
    await activateStory([mockRequest({ url: `${BASE}/profile` }, { body: 'the profile' })]);

    await fetch(`${BASE}/profile`);
    await fetch(`${BASE}/orders`).catch(() => {});
    await fetch(`${BASE}/graphql`, graphql('ChatMessages')).catch(() => {});

    // What the story's error keeps today: one refusal, the last.
    expect(readStoryError(STORY_ID)?.message).toBe(`no mock rule matches POST ${BASE}/graphql`);

    expect(unansweredRequestsOfStory()).toEqual([
      { method: 'GET', url: `${BASE}/orders`, answered: 'refused', times: 1 },
      {
        method: 'POST',
        url: `${BASE}/graphql`,
        operationName: 'ChatMessages',
        answered: 'refused',
        times: 1,
      },
    ]);
  });

  it('a passthrough story lists what reached the real network, each request once', async () => {
    await activateStory([
      mockRequest({ operationName: 'Profile' }, { body: { data: {} } }),
      mockRequest.passthrough(),
    ]);

    await fetch(`${BASE}/graphql`, graphql('Profile'));
    await fetch(`${BASE}/graphql`, graphql('ChatMessages'));
    await fetch(`${BASE}/graphql`, graphql('ChatMessages'));
    await fetch(`${BASE}/flags`);

    expect(readStoryError(STORY_ID)).toBeUndefined();
    expect(unansweredRequestsOfStory()).toEqual([
      {
        method: 'POST',
        url: `${BASE}/graphql`,
        operationName: 'ChatMessages',
        answered: 'passthrough',
        times: 2,
      },
      { method: 'GET', url: `${BASE}/flags`, answered: 'passthrough', times: 1 },
    ]);
  });

  it('a story with no network mock is seen only while the capture listens, and still reaches the network', async () => {
    await activateStory([]);
    await fetch(`${BASE}/flags`);
    expect(unansweredRequestsOfStory()).toEqual([]);

    listenToRequests(true);
    await activateStory([]);
    await expect((await fetch(`${BASE}/flags`)).text()).resolves.toBe('from the network');

    expect(unansweredRequestsOfStory()).toEqual([
      { method: 'GET', url: `${BASE}/flags`, answered: 'passthrough', times: 1 },
    ]);
  });

  it('the next story starts with an empty list', async () => {
    await activateStory([mockRequest.passthrough()]);
    await fetch(`${BASE}/flags`);
    await activateStory([mockRequest.passthrough()]);

    expect(unansweredRequestsOfStory()).toEqual([]);
  });
});
