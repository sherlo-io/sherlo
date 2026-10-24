/**
 * A capture record never says captured over a wrong screen: it proves its rules were installed,
 * lists the ones nothing used, and always says why the app crashed.
 */
const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

vi.mock('../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import { NativeModules } from 'react-native';
import { isBundlerAssetUrl } from '../bundlerOrigin';
import {
  causeOfCrash,
  clearStoryError,
  recordStoryError,
  threwOf,
} from '../getStorybook/storyErrorRegistry';
import { answerFor, setNetworkMocks } from '../mocking/networkRules';
import {
  activateMocks,
  clearMocks,
  newMockLookups,
  rulesInstalledProof,
  rulesNeverMatched,
} from '../mocking/registry';

const STORY_ID = 'honesty--default';

const twoRules = {
  rules: [
    { matcher: { method: 'GET' as const, url: 'https://a.invalid/used' }, answer: {} },
    { matcher: { method: 'GET' as const, url: 'https://a.invalid/spare' }, answer: {} },
  ],
  passthrough: false,
  sockets: [{ matcher: { url: 'wss://a.invalid/live' }, answer: 'pending' as const }],
};

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
});

afterEach(() => {
  clearMocks();
  clearStoryError(STORY_ID);
  delete NativeModules.SourceCode;
  vi.clearAllMocks();
});

function putRulesIn(): void {
  activateMocks({}, newMockLookups(STORY_ID));
  setNetworkMocks(twoRules, () => {}, 'held');
}

describe('the capture record says what happened', () => {
  it("the record proves the capture's rules were installed", () => {
    expect(rulesInstalledProof(STORY_ID)).toEqual({
      installed: false,
      modules: 0,
      requests: 0,
      sockets: 0,
    });

    putRulesIn();

    expect(rulesInstalledProof(STORY_ID)).toEqual({
      installed: true,
      modules: 0,
      requests: 2,
      sockets: 1,
    });
    expect(rulesInstalledProof('another--story').installed).toBe(false);
  });

  it('rules never matched are listed', () => {
    putRulesIn();
    answerFor({ method: 'GET', url: 'https://a.invalid/used' });

    expect(rulesNeverMatched()).toEqual(['GET https://a.invalid/spare', 'WS wss://a.invalid/live']);
  });

  it('a crashed record always carries its cause', () => {
    expect(causeOfCrash(STORY_ID)).toMatchObject({ name: 'AppCrashed' });
    expect(causeOfCrash(STORY_ID).message).not.toBe('');

    recordStoryError(STORY_ID, {
      name: 'RangeError',
      message: 'too deep',
      stack: '',
      componentStack: '',
    });

    expect(causeOfCrash(STORY_ID)).toMatchObject({ name: 'RangeError', message: 'too deep' });
  });

  it('an error that ends the capture also sets threw', () => {
    expect(threwOf(STORY_ID)).toBeUndefined();

    recordStoryError(STORY_ID, {
      name: 'UnmockedRequestError',
      message: 'no mock rule matches GET https://a.invalid/x',
      stack: 'at somewhere',
      componentStack: '',
    });

    expect(threwOf(STORY_ID)).toEqual({
      name: 'UnmockedRequestError',
      message: 'no mock rule matches GET https://a.invalid/x',
    });
  });

  it('a bundler-origin asset URL counts as a local image', () => {
    NativeModules.SourceCode = { scriptURL: 'http://192.168.1.5:8081/index.bundle?platform=ios' };

    expect(isBundlerAssetUrl('http://192.168.1.5:8081/assets/src/logo.png?platform=ios')).toBe(
      true
    );
    expect(isBundlerAssetUrl('https://cdn.example.com/assets/logo.png')).toBe(false);

    NativeModules.SourceCode = { scriptURL: 'file:///app/main.jsbundle' };

    expect(isBundlerAssetUrl('http://192.168.1.5:8081/assets/src/logo.png')).toBe(false);
  });
});
