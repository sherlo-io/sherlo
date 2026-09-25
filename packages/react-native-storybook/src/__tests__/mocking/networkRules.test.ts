/**
 * A story declares the answers to the requests its screen makes, and the SDK answers fetch and
 * XMLHttpRequest from those rules while the story is active.
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
import createMockable from '../../mocking/createMockable';
import { mock } from '../../mocking/mockDeclaration';
import { mockRequest } from '../../mocking/networkDeclaration';
import { sherloFetch } from '../../mocking/network';
import { UnmockedRequestError } from '../../mocking/networkRules';
import { __resetShimmedKeysForTests, clearMocks } from '../../mocking/registry';
import type { StoryMocks } from '../../mocking/mockDeclaration';
import type { StorybookView } from '../../types';

const BASE = 'https://mocking.sherlo.invalid';
const STORY_ID = 'mocking-network--default';

// ---------------------------------------------------------------------------
// The runtime a story runs in: a real fetch, and an XMLHttpRequest that records
// anything actually sent, so a request that reached the network is visible.
// ---------------------------------------------------------------------------

type Sent = { method: string; url: string; body: unknown };

class FakeXhr {
  static sent: Sent[] = [];

  readyState = 0;
  status = 0;
  statusText = '';
  responseText = '';
  response: unknown = '';
  responseType = '';
  onreadystatechange: ((event: unknown) => void) | null = null;
  onload: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onloadend: ((event: unknown) => void) | null = null;

  private opened: { method: string; url: string } = { method: 'GET', url: '' };

  open(method: string, url: string): void {
    this.opened = { method, url };
    this.readyState = 1;
  }

  send(body?: unknown): void {
    FakeXhr.sent.push({ ...this.opened, body });
  }

  getResponseHeader(_name: string): string | null {
    return null;
  }

  getAllResponseHeaders(): string {
    return '';
  }
}

const realFetch = globalThis.fetch;
const globals = globalThis as unknown as { fetch: typeof fetch; XMLHttpRequest: unknown };

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
  globals.fetch = realFetch;
  globals.XMLHttpRequest = FakeXhr;
  FakeXhr.sent = [];
});

afterEach(() => {
  clearMocks();
  __resetShimmedKeysForTests();
  clearStoryError(STORY_ID);
  globals.fetch = realFetch;
  delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  delete (globalThis as { STORIES?: unknown }).STORIES;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// One story, with whichever of the three levels declared what
// ---------------------------------------------------------------------------

/** Make "Mocking/Network"'s Default story the only story there is, and activate its mocks. */
async function activateStory(levels: {
  project?: StoryMocks;
  file?: StoryMocks;
  story?: StoryMocks;
}): Promise<void> {
  const fileExports = {
    default: {
      title: 'Mocking/Network',
      ...(levels.file ? { parameters: { sherlo: { mocks: levels.file } } } : {}),
    },
    Default: levels.story ? { parameters: { sherlo: { mocks: levels.story } } } : {},
  };
  const req = Object.assign(() => fileExports, { keys: () => ['./Network.stories.tsx'] });
  (globalThis as { STORIES?: unknown }).STORIES = [{ directory: './src', req }];

  const view = {
    _storyIndex: { entries: {} },
    _preview: {
      // Composed upfront, so the first pass already reads the project's own mocks.
      storyStoreValue: {
        projectAnnotations: {
          parameters: levels.project ? { sherlo: { mocks: levels.project } } : {},
        },
      },
      ready: () => Promise.resolve(),
    },
  } as unknown as StorybookView;

  await activateMocksForStory(view, STORY_ID);
}

/** What the rules answer a GET with, as text. */
async function get(url: string): Promise<string> {
  return (await fetch(url)).text();
}

/** The refusal a request that was meant to be refused was refused with. */
async function refusalOf(request: Promise<unknown>): Promise<UnmockedRequestError> {
  try {
    await request;
  } catch (error) {
    return error as UnmockedRequestError;
  }
  throw new Error('the request was answered, and was meant to be refused');
}

/** Send one request through XMLHttpRequest and hand back the instance once it is done. */
function sendXhr(
  method: string,
  url: string,
  body?: string
): Promise<FakeXhr & { states: number[] }> {
  const xhr = new (globals.XMLHttpRequest as new () => FakeXhr)() as FakeXhr & {
    states: number[];
  };
  xhr.states = [];

  return new Promise((resolve) => {
    xhr.onreadystatechange = () => xhr.states.push(xhr.readyState);
    xhr.onloadend = () => resolve(xhr);
    xhr.open(method, url);
    xhr.send(body);
  });
}

describe('a request the story names', () => {
  it('a matching request is answered from its rule with status, headers, body and delay', async () => {
    await activateStory({
      story: [
        mockRequest(
          { url: `${BASE}/orders` },
          {
            status: 201,
            headers: { 'x-sherlo': 'from the rule' },
            body: 'one order',
            delayMs: 50,
          }
        ),
      ],
    });

    const startedAt = Date.now();
    const response = await fetch(`${BASE}/orders`);

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(40);
    expect(response.status).toBe(201);
    expect(response.headers.get('x-sherlo')).toBe('from the rule');
    await expect(response.text()).resolves.toBe('one order');
  });

  it('a rule matches by method and a URL pattern, and a pattern may carry a wildcard', async () => {
    await activateStory({
      story: [
        mockRequest({ method: 'POST', url: `${BASE}/orders` }, { body: 'the order was placed' }),
        mockRequest({ method: 'GET', url: `${BASE}/orders/*` }, { body: 'one order' }),
      ],
    });

    const placed = await fetch(`${BASE}/orders`, { method: 'POST' });
    await expect(placed.text()).resolves.toBe('the order was placed');

    // The wildcard stands for the rest of the address, so every order is one rule.
    await expect(get(`${BASE}/orders/7`)).resolves.toBe('one order');
    await expect(get(`${BASE}/orders/8`)).resolves.toBe('one order');

    // The method is part of the rule: the same address with another method matches neither.
    const refusal = await refusalOf(fetch(`${BASE}/orders`));
    expect(refusal.message).toBe(`no mock rule matches GET ${BASE}/orders`);
  });

  it('a GraphQL request is matched by the operation name in its body', async () => {
    await activateStory({
      story: [mockRequest({ operationName: 'Orders' }, { body: { data: { orders: [] } } })],
    });

    const asked = await fetch(`${BASE}/graphql`, {
      method: 'POST',
      body: JSON.stringify({ operationName: 'Orders', query: 'query Orders { orders { id } }' }),
    });
    await expect(asked.json()).resolves.toEqual({ data: { orders: [] } });

    // Another operation at the same address is another request, and this story named only one.
    const refusal = await refusalOf(
      fetch(`${BASE}/graphql`, {
        method: 'POST',
        body: JSON.stringify({ operationName: 'Profile', query: 'query Profile { me { id } }' }),
      })
    );
    expect(refusal.message).toBe(`no mock rule matches POST ${BASE}/graphql`);
  });

  it('a request made through XMLHttpRequest is answered by the same rules as fetch', async () => {
    await activateStory({
      story: [mockRequest({ method: 'GET', url: `${BASE}/orders` }, { body: 'one order' })],
    });

    const xhr = await sendXhr('GET', `${BASE}/orders`);

    // The same answer fetch gets, delivered the way a real request delivers it.
    expect(xhr.states).toEqual([2, 3, 4]);
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe('one order');
    await expect(get(`${BASE}/orders`)).resolves.toBe('one order');

    // And nothing left the device: the real XMLHttpRequest was never sent.
    expect(FakeXhr.sent).toEqual([]);
  });

  it('a body given as an object is sent as JSON with the content type set', async () => {
    await activateStory({
      story: [mockRequest({ url: `${BASE}/profile` }, { body: { name: 'Ada Lovelace' } })],
    });

    const response = await fetch(`${BASE}/profile`);

    expect(response.headers.get('content-type')).toBe('application/json');
    await expect(response.json()).resolves.toEqual({ name: 'Ada Lovelace' });
  });
});

describe('a request no rule names', () => {
  it('a request no rule matches throws and the story records it', async () => {
    await activateStory({
      story: [mockRequest({ url: `${BASE}/profile` }, { body: 'the profile' })],
    });

    const refusal = await refusalOf(fetch(`${BASE}/orders`));
    expect(refusal).toBeInstanceOf(UnmockedRequestError);

    // The story is recorded as one that threw, in the registry a render error is recorded in -
    // which is what the capture and the test run both read.
    const recorded = readStoryError(STORY_ID);
    expect(recorded?.name).toBe('UnmockedRequestError');
    expect(recorded?.message).toBe(refusal.message);
  });

  it('the refusal names the method and the address: no mock rule matches GET <url>', async () => {
    await activateStory({
      story: [mockRequest({ url: `${BASE}/profile` }, { body: 'the profile' })],
    });

    const refusal = await refusalOf(fetch(`${BASE}/orders`));

    expect(refusal.name).toBe('UnmockedRequestError');
    expect(refusal.message).toBe('no mock rule matches GET https://mocking.sherlo.invalid/orders');
  });

  it('a story that opts into passthrough lets an unmatched request reach the network', async () => {
    const realNetwork = vi.fn(async () => new Response('from the network'));
    globals.fetch = realNetwork as unknown as typeof fetch;

    await activateStory({
      story: [
        mockRequest({ url: `${BASE}/orders` }, { body: 'from the rule' }),
        mockRequest.passthrough(),
      ],
    });

    await expect(get(`${BASE}/orders`)).resolves.toBe('from the rule');
    await expect(get(`${BASE}/anything-else`)).resolves.toBe('from the network');
    expect(realNetwork).toHaveBeenCalledTimes(1);

    // XMLHttpRequest passes through the same way - the real one is what sends the request.
    const xhr = new (globals.XMLHttpRequest as new () => FakeXhr)();
    xhr.open('GET', `${BASE}/anything-else`);
    xhr.send();
    expect(FakeXhr.sent).toEqual([
      { method: 'GET', url: `${BASE}/anything-else`, body: undefined },
    ]);

    // Nothing was refused, so the story threw nothing.
    expect(readStoryError(STORY_ID)).toBeUndefined();
  });

  it("Sherlo's own requests to its bundler are answered by the real network, never by the rules", async () => {
    const realNetwork = vi.fn(async () => new Response('from the bundler'));
    globals.fetch = realNetwork as unknown as typeof fetch;

    await activateStory({
      story: [mockRequest({ url: `${BASE}/orders` }, { body: 'one order' })],
    });

    // The capture socket, its log and the letterbox all go this way: Sherlo talking to its own
    // bundler is not the screen making a request, so no rule is about it and none refuses it.
    const answer = await sherloFetch('http://localhost:8081/sherlo/capture');

    await expect(answer.text()).resolves.toBe('from the bundler');
    expect(realNetwork).toHaveBeenCalledTimes(1);
    expect(readStoryError(STORY_ID)).toBeUndefined();
  });

  it('a story with no network rules at all leaves fetch and XMLHttpRequest untouched', async () => {
    await activateStory({ story: [] });

    expect(globals.fetch).toBe(realFetch);
    expect(globals.XMLHttpRequest).toBe(FakeXhr);

    // A story that mocks a module and no request is the same: nothing about the network changes.
    const shim = createMockable('pkg/untouched-network', { whoAmI: () => 'real' });
    await activateStory({
      story: [mock(() => Promise.resolve(shim), { whoAmI: () => 'mocked' })],
    });

    expect(globals.fetch).toBe(realFetch);
    expect(globals.XMLHttpRequest).toBe(FakeXhr);
  });
});

describe('the rules follow the story', () => {
  it('the rules are installed only in testing and storybook mode', async () => {
    mockGetMode.mockReturnValue('default');
    await activateStory({ story: [mockRequest({ url: `${BASE}/orders` }, { body: 'the rule' })] });

    // The app a customer ships runs the real network, whatever its stories declare.
    expect(globals.fetch).toBe(realFetch);
    expect(globals.XMLHttpRequest).toBe(FakeXhr);

    for (const mode of ['testing', 'storybook']) {
      mockGetMode.mockReturnValue(mode);
      await activateStory({
        story: [mockRequest({ url: `${BASE}/orders` }, { body: 'the rule' })],
      });

      expect(globals.fetch).not.toBe(realFetch);
      expect(globals.XMLHttpRequest).not.toBe(FakeXhr);
      await expect(get(`${BASE}/orders`)).resolves.toBe('the rule');

      clearMocks();
    }
  });

  it('switching stories replaces the rules, and clearing the mocks restores the real fetch and XMLHttpRequest', async () => {
    await activateStory({ story: [mockRequest({ url: `${BASE}/orders` }, { body: 'one order' })] });
    await expect(get(`${BASE}/orders`)).resolves.toBe('one order');

    const wrappedFetch = globals.fetch;

    await activateStory({
      story: [mockRequest({ url: `${BASE}/profile` }, { body: 'the profile' })],
    });

    // The next story's rules are the only rules, and nothing was reinstalled to make that so.
    await expect(get(`${BASE}/profile`)).resolves.toBe('the profile');
    expect(globals.fetch).toBe(wrappedFetch);
    const refusal = await refusalOf(fetch(`${BASE}/orders`));
    expect(refusal.message).toBe(`no mock rule matches GET ${BASE}/orders`);
    clearStoryError(STORY_ID);

    clearMocks();

    expect(globals.fetch).toBe(realFetch);
    expect(globals.XMLHttpRequest).toBe(FakeXhr);
  });

  it("a story's rules are added to the file's and the project's, and the more specific level wins the same matcher", async () => {
    await activateStory({
      project: [
        mockRequest({ url: `${BASE}/orders` }, { body: 'the project orders' }),
        mockRequest({ url: `${BASE}/settings` }, { body: 'the project settings' }),
      ],
      file: [
        mockRequest({ url: `${BASE}/orders` }, { body: 'the file orders' }),
        mockRequest({ url: `${BASE}/profile` }, { body: 'the file profile' }),
      ],
      story: [mockRequest({ url: `${BASE}/orders` }, { body: 'the story orders' })],
    });

    // The same matcher at three levels: the story's answer is the one given.
    await expect(get(`${BASE}/orders`)).resolves.toBe('the story orders');

    // And what the outer levels named and the story did not is still answered.
    await expect(get(`${BASE}/profile`)).resolves.toBe('the file profile');
    await expect(get(`${BASE}/settings`)).resolves.toBe('the project settings');
  });
});
