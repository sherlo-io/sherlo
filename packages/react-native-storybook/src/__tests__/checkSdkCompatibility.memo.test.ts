/**
 * Tests for checkSdkCompatibility() memoization behavior.
 * Verifies that sendNativeError is called exactly once even across
 * multiple invocations, and that __resetCacheForTests() restores fresh eval.
 *
 * Native version cases tested: null / lower / equal / higher / prerelease.
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

describe('checkSdkCompatibility - memoization', () => {
  it('calls sendNativeError once and returns false when native version is null', () => {
    mockGetNativeVersion.mockReturnValue(null);
    const r1 = checkSdkCompatibility();
    const r2 = checkSdkCompatibility();
    expect(r1).toBe(false);
    expect(r2).toBe(false);
    expect(mockSendNativeError).toHaveBeenCalledOnce();
  });

  it('does NOT call sendNativeError again after the first incompatible call (cache hit)', () => {
    mockGetNativeVersion.mockReturnValue(null);
    checkSdkCompatibility();
    checkSdkCompatibility();
    checkSdkCompatibility();
    expect(mockSendNativeError).toHaveBeenCalledOnce();
  });

  it('after __resetCacheForTests(), sendNativeError fires again on next call', () => {
    mockGetNativeVersion.mockReturnValue(null);
    checkSdkCompatibility();
    expect(mockSendNativeError).toHaveBeenCalledOnce();

    __resetCacheForTests();
    checkSdkCompatibility();
    expect(mockSendNativeError).toHaveBeenCalledTimes(2);
  });
});

describe('checkSdkCompatibility - native version cases', () => {
  it('null native version → false, error emitted with "missing" in message', () => {
    mockGetNativeVersion.mockReturnValue(null);
    expect(checkSdkCompatibility()).toBe(false);
    expect(mockSendNativeError).toHaveBeenCalledOnce();
    expect(mockSendNativeError).toHaveBeenCalledWith(
      'ERROR_SDK_COMPATIBILITY',
      expect.stringContaining('missing'),
      expect.any(Object)
    );
  });

  it('lower native version → false, error emitted with "below" in message', () => {
    mockGetNativeVersion.mockReturnValue('0.0.1');
    expect(checkSdkCompatibility()).toBe(false);
    expect(mockSendNativeError).toHaveBeenCalledOnce();
    expect(mockSendNativeError).toHaveBeenCalledWith(
      'ERROR_SDK_COMPATIBILITY',
      expect.stringContaining('below'),
      expect.any(Object)
    );
  });

  it('equal native version → true, no error', () => {
    const { REQUIRED_MIN_NATIVE_VERSION } = require('../sdk-compatibility.json');
    mockGetNativeVersion.mockReturnValue(REQUIRED_MIN_NATIVE_VERSION);
    expect(checkSdkCompatibility()).toBe(true);
    expect(mockSendNativeError).not.toHaveBeenCalled();
  });

  it('higher native version → true, no error', () => {
    mockGetNativeVersion.mockReturnValue('999.0.0');
    expect(checkSdkCompatibility()).toBe(true);
    expect(mockSendNativeError).not.toHaveBeenCalled();
  });

  it('prerelease native version with same core → true (prerelease suffix stripped)', () => {
    const { REQUIRED_MIN_NATIVE_VERSION } = require('../sdk-compatibility.json');
    const [major, minor, patch] = REQUIRED_MIN_NATIVE_VERSION.split('.').map(Number);
    mockGetNativeVersion.mockReturnValue(`${major}.${minor}.${patch}-alpha.99`);
    expect(checkSdkCompatibility()).toBe(true);
    expect(mockSendNativeError).not.toHaveBeenCalled();
  });
});
