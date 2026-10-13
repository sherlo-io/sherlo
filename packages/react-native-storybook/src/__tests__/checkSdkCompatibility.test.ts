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
