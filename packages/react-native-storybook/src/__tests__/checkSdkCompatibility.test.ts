/**
 * The runtime check compares the native SDK version against the minimum this JS module needs. An
 * SDK published as a prerelease (`3.0.0-alpha.0`) bakes that same version into the native side,
 * while the minimum names a plain `3.0.0`: the check compares major.minor.patch only, so the app
 * does not refuse itself.
 */

const { mockSendNativeError, mockGetNativeVersion } = vi.hoisted(() => ({
  mockSendNativeError: vi.fn(),
  mockGetNativeVersion: vi.fn<[], string | null>(),
}));

vi.mock('../SherloModule', () => ({
  default: {
    sendNativeError: mockSendNativeError,
    getNativeVersion: mockGetNativeVersion,
  },
}));

import checkSdkCompatibility, { __resetCacheForTests } from '../checkSdkCompatibility';

beforeEach(() => {
  vi.clearAllMocks();
  __resetCacheForTests();
});

describe('checkSdkCompatibility', () => {
  it('a prerelease JS module meets the native minimum of the same major.minor.patch', () => {
    // The native side's sherlo.json carries the package version, the same as the JS module's:
    // today `3.0.0-alpha.0` against a minimum of `3.0.0`. An app on one SDK must accept itself.
    const { JS_MODULE_VERSION } = require('../sdk-compatibility.json');
    mockGetNativeVersion.mockReturnValue(JS_MODULE_VERSION);

    expect(checkSdkCompatibility()).toBe(true);
    expect(mockSendNativeError).not.toHaveBeenCalled();
  });
});

describe('the capture record says what happened', () => {
  it('an SDK older than the installed package warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { JS_MODULE_VERSION } = require('../sdk-compatibility.json');

    mockGetNativeVersion.mockReturnValue(JS_MODULE_VERSION);
    expect(checkSdkCompatibility()).toBe(true);
    expect(warn).not.toHaveBeenCalled();

    __resetCacheForTests();
    mockGetNativeVersion.mockReturnValue('3.0.0');
    const older = JS_MODULE_VERSION.replace(/^\d+\.\d+\.\d+/, '3.1.0');
    vi.doMock('../sdk-compatibility.json', () => ({
      REQUIRED_MIN_NATIVE_VERSION: '3.0.0',
      JS_MODULE_VERSION: older,
    }));
    vi.resetModules();
    return import('../checkSdkCompatibility').then(({ default: check }) => {
      expect(check()).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('3.0.0');
      warn.mockRestore();
      vi.doUnmock('../sdk-compatibility.json');
    });
  });
});
