/**
 * Tests for `test:bundled --dry-run --emit-expectation` (expectation-emit mode).
 *
 * The core claim under test (per the one-formatter law): for every scenario, the
 * minted text is produced by the SAME guard + throwError formatter a live run
 * uses - never a second, hand-written copy of the message. Each test triggers
 * the guard directly (the "live" call) with the SAME synthetic input the
 * scenario itself feeds the guard, then asserts the minted text equals the raw
 * live message once the known volatile literal is masked back in - i.e. outside
 * the placeholder span, the two are byte-for-byte identical, and the placeholder
 * sits exactly where the volatile value was.
 */
import { describe, expect, it } from 'vitest';
import {
  EXPECTATION_PLACEHOLDERS,
  EXPECTATION_SCENARIO_IDS,
  renderExpectation,
} from '../emitExpectation';
import parseConfigFile from '../../../helpers/getValidatedCommandParams/getNormalizedConfig/parseConfigFile';
import validateDevices from '../../../helpers/getValidatedCommandParams/validateCommandParams/validateDevices';
import validateToken from '../../../helpers/getValidatedCommandParams/validateCommandParams/validateToken';
import validateBinariesInfo from '../../../helpers/getValidatedBinariesInfoAndNextBuildIndex/validateBinariesInfo';
import { validatePlatformPaths } from '../../../helpers/shared';
import { TEST_COMMAND } from '../../../constants';
import { BinariesInfo, InvalidatedConfig } from '../../../types';

/** Runs a guard expected to throw and returns the raw thrown message ("the live call"). */
function liveMessage(runGuard: () => void): string {
  try {
    runGuard();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected guard to throw');
}

describe('renderExpectation - no volatile values', () => {
  it("token-missing equals validateToken's live message verbatim", () => {
    const live = liveMessage(() => validateToken({} as InvalidatedConfig));
    expect(renderExpectation('token-missing')).toBe(live);
  });

  it("token-malformed equals validateToken's live message verbatim", () => {
    const live = liveMessage(() =>
      validateToken({ token: 'not-a-real-sherlo-token' } as InvalidatedConfig)
    );
    expect(renderExpectation('token-malformed')).toBe(live);
  });

  it("devices-empty equals validateDevices's live message verbatim", () => {
    const live = liveMessage(() => validateDevices({ devices: [] } as InvalidatedConfig));
    expect(renderExpectation('devices-empty')).toBe(live);
  });

  it("binary-path-missing equals validatePlatformPaths's live message verbatim", () => {
    const live = liveMessage(() =>
      validatePlatformPaths({
        platformsToValidate: ['android'],
        android: undefined,
        command: TEST_COMMAND,
      })
    );
    expect(renderExpectation('binary-path-missing')).toBe(live);
  });
});

describe('renderExpectation - masks the volatile value it fed in', () => {
  it('config-missing: masks the config path, byte-identical otherwise', () => {
    const configPath = '/Users/sherlo-user/my-app/sherlo.config.json';
    const live = liveMessage(() => parseConfigFile(configPath));
    const minted = renderExpectation('config-missing');

    expect(live).toContain(configPath);
    expect(minted).not.toContain(configPath);
    expect(minted).toContain(EXPECTATION_PLACEHOLDERS.CONFIG_PATH);
    expect(minted).toBe(live.split(configPath).join(EXPECTATION_PLACEHOLDERS.CONFIG_PATH));
  });

  it('project-root-invalid: same guard/branch as config-missing, byte-identical outside the path', () => {
    const configMissing = renderExpectation('config-missing');
    const projectRootInvalid = renderExpectation('project-root-invalid');

    expect(projectRootInvalid).toBe(configMissing);
  });

  it('binary-path-nonexistent: masks the android build path, byte-identical otherwise', () => {
    const androidPath = '/Users/sherlo-user/my-app/builds/app-release.apk';
    const live = liveMessage(() =>
      validatePlatformPaths({
        platformsToValidate: ['android'],
        android: androidPath,
        command: TEST_COMMAND,
      })
    );
    const minted = renderExpectation('binary-path-nonexistent');

    expect(live).toContain(androidPath);
    expect(minted).not.toContain(androidPath);
    expect(minted).toContain(EXPECTATION_PLACEHOLDERS.ANDROID_BUILD_PATH);
    expect(minted).toBe(live.split(androidPath).join(EXPECTATION_PLACEHOLDERS.ANDROID_BUILD_PATH));
  });

  it('binary-abi-x86-only: masks the build file name, byte-identical otherwise, keeps the ABI list', () => {
    const fileName = 'app-release.apk';
    const binariesInfo: BinariesInfo = {
      android: {
        hash: 'stand-in-hash',
        buildType: 'preview',
        fileName,
        s3Key: '',
        sdkVersion: '2.0.0',
        androidAbis: ['x86_64'],
      },
    };
    const live = liveMessage(() => validateBinariesInfo({ binariesInfo, command: TEST_COMMAND }));
    const minted = renderExpectation('binary-abi-x86-only');

    expect(live).toContain(fileName);
    expect(minted).not.toContain(fileName);
    expect(minted).toContain(EXPECTATION_PLACEHOLDERS.ANDROID_BUILD_FILE_NAME);
    expect(minted).toContain('x86_64');
    expect(minted).toBe(
      live.split(fileName).join(EXPECTATION_PLACEHOLDERS.ANDROID_BUILD_FILE_NAME)
    );
  });
});

describe('renderExpectation - scenario catalogue', () => {
  it('covers every guard the emit mode documents (one-formatter law, no parallel print path)', () => {
    expect(EXPECTATION_SCENARIO_IDS.sort()).toEqual(
      [
        'token-missing',
        'token-malformed',
        'devices-empty',
        'config-missing',
        'project-root-invalid',
        'binary-path-missing',
        'binary-path-nonexistent',
        'binary-abi-x86-only',
      ].sort()
    );
  });

  it('throws with the catalogue for an unknown scenario id', () => {
    expect(() => renderExpectation('does-not-exist')).toThrow(
      /Unknown --emit-expectation scenario/
    );
  });
});
