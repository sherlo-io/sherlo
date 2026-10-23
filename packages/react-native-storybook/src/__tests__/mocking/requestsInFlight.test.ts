/**
 * The requests the screen is still waiting on (mocking/requestsInFlight): a request is counted from
 * the moment the app makes it until its answer comes, however it is answered - a scene waits for
 * the list to be empty before it is photographed.
 */
const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import { clearStoryError } from '../../getStorybook/storyErrorRegistry';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { mockRequest } from '../../mocking/networkDeclaration';
import { clearMocks } from '../../mocking/registry';
import {
  __resetRequestsInFlightForTests,
  requestStarted,
  requestsInFlight,
} from '../../mocking/requestsInFlight';
import type { StoryMocks } from '../../mocking/mockDeclaration';
import { startStorybookHolding } from './storybookHolding';

const BASE = 'https://mocking.sherlo.invalid';
const STORY_ID = 'mocking-inflight--default';

const realFetch = globalThis.fetch;
const globals = globalThis as unknown as { fetch: typeof fetch };

let answerTheNetwork: () => void;
const network = vi.fn(
  () =>
    new Promise<Response>((resolve) => {
      answerTheNetwork = () => resolve(new Response('from the network'));
    })
);

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
  __resetRequestsInFlightForTests();
});

afterEach(() => {
  delete (globalThis as { __sherloStillReal?: unknown }).__sherloStillReal;
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
        importPath: './src/InFlight.stories.tsx',
        title: 'Mocking/InFlight',
        fileExports: {
          default: { title: 'Mocking/InFlight' },
          Default: { parameters: { sherlo: { mocks: story } } },
        },
        stories: [{ id: STORY_ID, name: 'Default' }],
      },
    ],
    undefined
  );
  await activateMocksForStory(STORY_ID);
}

describe('the requests in flight', () => {
  it('a request counts from the moment it is made until it ends, and ending it twice ends it once', () => {
    const first = requestStarted({ method: 'GET', url: `${BASE}/a` });
    const second = requestStarted({ method: 'POST', url: `${BASE}/b` });
    expect(requestsInFlight()).toEqual([
      { method: 'GET', url: `${BASE}/a` },
      { method: 'POST', url: `${BASE}/b` },
    ]);

    first();
    first();

    expect(requestsInFlight()).toEqual([{ method: 'POST', url: `${BASE}/b` }]);
    second();
    expect(requestsInFlight()).toEqual([]);
  });

  it('a request let through to the network is in flight until the network answers', async () => {
    await activateStory([mockRequest.passthrough()]);

    const answered = fetch(`${BASE}/flags`);
    await vi.waitFor(() =>
      expect(requestsInFlight()).toEqual([{ method: 'GET', url: `${BASE}/flags` }])
    );

    answerTheNetwork();
    await answered;

    expect(requestsInFlight()).toEqual([]);
  });

  it('a request a rule answers, and one no rule matches, are done once their answer is in', async () => {
    await activateStory([mockRequest({ url: `${BASE}/profile` }, { body: 'the profile' })]);

    await fetch(`${BASE}/profile`);
    await fetch(`${BASE}/orders`).catch(() => {});

    expect(requestsInFlight()).toEqual([]);
  });
});
