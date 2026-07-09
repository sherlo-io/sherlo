import { describe, expect, it } from 'vitest';
import validateBinariesInfo from '../getValidatedBinariesInfoAndNextBuildIndex/validateBinariesInfo';
import { BinariesInfo, BinaryInfo } from '../../types';
import { TEST_STANDARD_COMMAND } from '../../constants';

/**
 * Minimal valid android BinaryInfo that passes all non-ABI validations
 * (hasSherlo, buildType = preview for standard test). Tests overlay only the
 * ABI-related fields they care about.
 */
const validAndroidBinary: BinaryInfo = {
  hash: 'abc123',
  buildType: 'preview',
  fileName: 'app-release.apk',
  s3Key: 'builds/abc123/app-release.apk',
  sdkVersion: '2.0.0',
};

const command = TEST_STANDARD_COMMAND;

// ---------------------------------------------------------------------------
// ABI preflight – rejection
// ---------------------------------------------------------------------------

describe('ABI preflight – rejection', () => {
  it('rejects an APK missing arm64-v8a with the Expo fix hint (expo-build-properties)', () => {
    const binaries: BinariesInfo = {
      android: {
        ...validAndroidBinary,
        androidAbis: ['x86_64'],
        expoSdkVersion: '52.0.0',
      },
    };

    expect(() => validateBinariesInfo({ binariesInfo: binaries, command })).toThrow();

    try {
      validateBinariesInfo({ binariesInfo: binaries, command });
    } catch (error: any) {
      const message = error.message;
      expect(message).toContain('missing arm64-v8a');
      expect(message).toContain('expo-build-properties');
      expect(message).not.toContain('reactNativeArchitectures');
    }
  });

  it('rejects an APK missing arm64-v8a with the bare-RN fix hint (reactNativeArchitectures)', () => {
    const binaries: BinariesInfo = {
      android: {
        ...validAndroidBinary,
        androidAbis: ['x86_64'],
        // No expoSdkVersion → bare RN path
      },
    };

    expect(() => validateBinariesInfo({ binariesInfo: binaries, command })).toThrow();

    try {
      validateBinariesInfo({ binariesInfo: binaries, command });
    } catch (error: any) {
      const message = error.message;
      expect(message).toContain('missing arm64-v8a');
      expect(message).toContain('reactNativeArchitectures');
      expect(message).not.toContain('expo-build-properties');
    }
  });

  it('includes the detected ABI list and file name in the error message', () => {
    const binaries: BinariesInfo = {
      android: {
        ...validAndroidBinary,
        androidAbis: ['x86_64', 'armeabi-v7a'],
        fileName: 'my-custom-build.apk',
        expoSdkVersion: '52.0.0',
      },
    };

    try {
      validateBinariesInfo({ binariesInfo: binaries, command });
      expect.unreachable('Expected validateBinariesInfo to throw');
    } catch (error: any) {
      expect(error.message).toContain('x86_64, armeabi-v7a');
      expect(error.message).toContain('my-custom-build.apk');
    }
  });
});

// ---------------------------------------------------------------------------
// ABI preflight – accept
// ---------------------------------------------------------------------------

describe('ABI preflight – accept', () => {
  it('accepts an APK whose androidAbis includes arm64-v8a', () => {
    const binaries: BinariesInfo = {
      android: {
        ...validAndroidBinary,
        androidAbis: ['arm64-v8a', 'x86_64'],
      },
    };

    // Must not throw for ABI reasons. Other validations (hasSherlo, buildType)
    // are satisfied by validAndroidBinary, so the call should succeed.
    expect(() => validateBinariesInfo({ binariesInfo: binaries, command })).not.toThrow();
  });

  it('accepts an APK with only arm64-v8a in its ABI list', () => {
    const binaries: BinariesInfo = {
      android: {
        ...validAndroidBinary,
        androidAbis: ['arm64-v8a'],
      },
    };

    expect(() => validateBinariesInfo({ binariesInfo: binaries, command })).not.toThrow();
  });

  it('skips ABI validation when androidAbis is undefined (non-APK or no android binary)', () => {
    const binaries: BinariesInfo = {
      android: {
        ...validAndroidBinary,
        androidAbis: undefined,
      },
    };

    expect(() => validateBinariesInfo({ binariesInfo: binaries, command })).not.toThrow();
  });

  it('accepts an APK with an empty ABI list (no native libraries – installs on any ABI)', () => {
    const binaries: BinariesInfo = {
      android: {
        ...validAndroidBinary,
        androidAbis: [],
      },
    };

    expect(() => validateBinariesInfo({ binariesInfo: binaries, command })).not.toThrow();
  });

  it('skips ABI validation when there is no android binary at all', () => {
    const binaries: BinariesInfo = {
      ios: {
        hash: 'def456',
        buildType: 'preview',
        fileName: 'app.ipa',
        s3Key: 'builds/def456/app.ipa',
        sdkVersion: '2.0.0',
      },
    };

    expect(() => validateBinariesInfo({ binariesInfo: binaries, command })).not.toThrow();
  });
});
