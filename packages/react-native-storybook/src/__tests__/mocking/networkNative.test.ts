/**
 * A story's network rules handed to native code, so a request a native library makes itself (a
 * picture downloaded to a file, an image view's own loader) gets the same answer fetch would.
 */
const { mockGetMode, setNativeRequestAnswers, nativeModule } = vi.hoisted(() => {
  const setNativeRequestAnswers = vi.fn();
  return {
    mockGetMode: vi.fn(),
    setNativeRequestAnswers,
    nativeModule: { setNativeRequestAnswers, addListener: () => {} } as {
      setNativeRequestAnswers?: typeof setNativeRequestAnswers;
      addListener: () => void;
    },
  };
});

vi.mock('../../SherloModule', () => ({ default: { getMode: mockGetMode } }));
vi.mock('../../specs/NativeSherloModule', () => ({ default: nativeModule }));
vi.mock('../../bundlerOrigin', () => ({
  bundlerOrigin: () => 'http://localhost:8082',
  isBundlerSocketUrl: () => false,
}));

import { activateNetworkMocks, clearNetworkMocks } from '../../mocking/network';
import {
  mockRequest,
  NetworkMockDeclaration,
  networkMocksOf,
} from '../../mocking/networkDeclaration';
import { setDiscover, UnmockedRequestError, unansweredRequests } from '../../mocking/networkRules';
import { __emitMessageFromTheConnection } from '../__mocks__/react-native';

const realFetch = globalThis.fetch;

/** What native code was last handed, parsed. */
function handedToNative(): {
  unmatched: string;
  bundlerOrigin: string | null;
  rules: Record<string, unknown>[];
} {
  return JSON.parse(setNativeRequestAnswers.mock.calls.at(-1)?.[0]);
}

function activate(...declarations: NetworkMockDeclaration[]): void {
  activateNetworkMocks(networkMocksOf(declarations), () => {});
}

beforeEach(() => {
  mockGetMode.mockReturnValue('storybook');
});

afterEach(() => {
  clearNetworkMocks();
  setDiscover(false);
  delete (globalThis as { __sherloStillReal?: unknown }).__sherloStillReal;
  globalThis.fetch = realFetch;
  nativeModule.setNativeRequestAnswers = setNativeRequestAnswers;
  vi.clearAllMocks();
});

describe('the rules handed to native code', () => {
  it('the rules in effect reach the native side, GraphQL-operation rules left to JS', () => {
    activate(
      mockRequest({ method: 'POST', url: 'https://api.example/save' }, { status: 201 }),
      mockRequest({ url: 'https://pictures.example/*' }, { body: 'any' }),
      mockRequest({ url: /\/photos\/\d+$/i }, { body: 'pattern' }),
      mockRequest({ operationName: 'GetUser' }, { body: { data: {} } })
    );

    expect(handedToNative()).toMatchObject({
      unmatched: 'refusal',
      bundlerOrigin: 'http://localhost:8082',
      rules: [
        { method: 'POST', url: { kind: 'exact', value: 'https://api.example/save' }, status: 201 },
        { url: { kind: 'prefix', value: 'https://pictures.example/' }, status: 200 },
        { url: { kind: 'regex', value: '\\/photos\\/\\d+$', ignoreCase: true } },
      ],
    });
    expect(handedToNative().rules).toHaveLength(3);
  });

  it("a rule's body reaches native as bytes, so a picture answer is drawn", () => {
    activate(
      mockRequest(
        { url: 'https://pictures.example/cat.png' },
        { headers: { 'content-type': 'image/png' }, bodyBase64: 'iVBORw0KGgo=' }
      ),
      mockRequest({ url: 'https://api.example/greeting' }, { body: 'zażółć' }),
      mockRequest({ url: 'https://api.example/user' }, { body: { name: 'Ada' } })
    );

    const [picture, text, json] = handedToNative().rules;
    expect(picture).toEqual({
      url: { kind: 'exact', value: 'https://pictures.example/cat.png' },
      status: 200,
      headers: { 'content-type': 'image/png' },
      bodyBase64: 'iVBORw0KGgo=',
    });
    expect(Buffer.from(text.bodyBase64 as string, 'base64').toString('utf8')).toBe('zażółć');
    expect(json).toMatchObject({ headers: { 'content-type': 'application/json' } });
    expect(Buffer.from(json.bodyBase64 as string, 'base64').toString('utf8')).toBe(
      '{"name":"Ada"}'
    );
  });

  it('a request no native rule matches gets what fetch would in that mode', () => {
    activate(mockRequest({ url: 'https://api.example/a' }, { body: 'a' }));
    expect(handedToNative().unmatched).toBe('refusal');

    activate(
      mockRequest({ url: 'https://api.example/a' }, { body: 'a' }),
      mockRequest.passthrough()
    );
    expect(handedToNative().unmatched).toBe('passthrough');

    setDiscover(true);
    activate(mockRequest({ url: 'https://api.example/a' }, { body: 'a' }));
    expect(handedToNative().unmatched).toBe('held');
    setDiscover(false);

    activate();
    expect(handedToNative()).toMatchObject({ unmatched: 'passthrough', rules: [] });

    clearNetworkMocks();
    expect(handedToNative()).toMatchObject({ unmatched: 'passthrough', rules: [] });
  });

  it('a capture story with no network mock lets every native request through', () => {
    (globalThis as { __sherloStillReal?: unknown }).__sherloStillReal = {
      isTesting: true,
      isCapture: () => true,
      startStory: () => {},
      readStory: () => [],
    };
    mockGetMode.mockReturnValue('testing');

    activate();

    expect(handedToNative()).toMatchObject({ unmatched: 'passthrough', rules: [] });
  });

  it('the app a customer ships hands native code nothing', () => {
    mockGetMode.mockReturnValue('default');

    activate(mockRequest({ url: 'https://api.example/a' }, { body: 'a' }));

    expect(setNativeRequestAnswers).not.toHaveBeenCalled();
  });

  // Native code installs its answering only when rules are first handed over (iOS replaces the
  // session-configuration getters then), so a shipped app must never hand any, not even on a clear.
  it('clearing the mocks in the app a customer ships hands native code nothing', () => {
    mockGetMode.mockReturnValue('default');

    clearNetworkMocks();

    expect(setNativeRequestAnswers).not.toHaveBeenCalled();
  });

  it('a native build without the method still lets JavaScript answer', () => {
    nativeModule.setNativeRequestAnswers = undefined;

    expect(() =>
      activate(mockRequest({ url: 'https://api.example/a' }, { body: 'a' }))
    ).not.toThrow();
  });
});

describe('the requests native code met that no rule matches', () => {
  /** Native code raising its event for one request it met, as the fake module sends it. */
  function nativeMeets(request: Record<string, unknown>): void {
    __emitMessageFromTheConnection(request, 'SherloUnansweredRequest');
  }

  it('a fetch let through and the native echo of it give one entry', async () => {
    globalThis.fetch = vi.fn(async () => new Response('ok')) as unknown as typeof fetch;
    activateNetworkMocks(networkMocksOf([mockRequest.passthrough()]), () => {});

    await fetch('https://api.example');
    nativeMeets({ method: 'GET', url: 'https://api.example/' });

    expect(unansweredRequests()).toEqual([{ method: 'GET', url: 'https://api.example' }]);

    nativeMeets({ method: 'GET', url: 'https://api.example/' });

    expect(unansweredRequests()).toHaveLength(2);
  });

  it('an event of another name is not heard as a native request', () => {
    activate(mockRequest({ url: 'https://api.example/a' }, { body: 'a' }));

    __emitMessageFromTheConnection({ method: 'GET', url: 'https://pictures.example/cat.png' });

    expect(unansweredRequests()).toEqual([]);
  });

  it('a native request no rule matches is listed and refuses the story the way a JS request does', () => {
    const refusals: Error[] = [];
    activateNetworkMocks(
      networkMocksOf([mockRequest({ url: 'https://api.example/a' }, { body: 'a' })]),
      (refusal) => refusals.push(refusal)
    );

    nativeMeets({
      method: 'get',
      url: 'https://pictures.example/cat.png',
      contentType: 'image/png',
    });

    expect(unansweredRequests()).toEqual([
      { method: 'GET', url: 'https://pictures.example/cat.png', contentType: 'image/png' },
    ]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toBeInstanceOf(UnmockedRequestError);
    expect(refusals[0].message).toBe(
      'no mock rule matches GET https://pictures.example/cat.png. Add a rule for it, or let it through.'
    );
  });

  it('a native request in a story that lets requests through is listed and refuses nothing', () => {
    const refusals: Error[] = [];
    activateNetworkMocks(networkMocksOf([mockRequest.passthrough()]), (refusal) =>
      refusals.push(refusal)
    );

    nativeMeets({ method: 'GET', url: 'https://pictures.example/cat.png' });

    expect(unansweredRequests()).toEqual([
      { method: 'GET', url: 'https://pictures.example/cat.png' },
    ]);
    expect(refusals).toEqual([]);
  });

  it('a native request told with no address is not listed', () => {
    activate(mockRequest({ url: 'https://api.example/a' }, { body: 'a' }));

    nativeMeets({ method: 'GET' });

    expect(unansweredRequests()).toEqual([]);
  });

  it('a native request is not listed once the mocks are cleared', () => {
    activate(mockRequest({ url: 'https://api.example/a' }, { body: 'a' }));
    clearNetworkMocks();

    nativeMeets({ method: 'GET', url: 'https://pictures.example/cat.png' });

    expect(unansweredRequests()).toEqual([]);
  });
});
