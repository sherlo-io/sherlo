/**
 * A story's network rules handed to native code, so a request a native library makes itself (a
 * picture downloaded to a file, an image view's own loader) gets the same answer fetch would.
 */
const { mockGetMode, setNativeRequestAnswers, nativeModule } = vi.hoisted(() => {
  const setNativeRequestAnswers = vi.fn();
  return {
    mockGetMode: vi.fn(),
    setNativeRequestAnswers,
    nativeModule: { setNativeRequestAnswers } as {
      setNativeRequestAnswers?: typeof setNativeRequestAnswers;
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
import { setDiscover } from '../../mocking/networkRules';

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
