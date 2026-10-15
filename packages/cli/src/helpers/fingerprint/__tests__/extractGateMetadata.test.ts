/**
 * Binary-derivation regression for `sherlo test --android/--ios` (SHERLO-1760).
 *
 * extractGateMetadata is the ONLY gate-metadata constructor for the binary
 * registration path, and its metadata IS genuinely read out of the compiled
 * APK/IPA. This test pins that it marks the metadata `derivedFrom: 'binary'`.
 *
 * SHERLO-1761 diffs binary-marked and legacy-unmarked metadata IDENTICALLY, so
 * the explicit marker is behavior-preserving - it only makes the derivation
 * honest at the type level; the gate outcome is unchanged.
 *
 * All binary IO is mocked to fail soft, so the extractor takes its default
 * branches instantly (no real unzip / tar / aapt subprocesses) and the test is
 * about the MARKER, not what any field could read from a real binary.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A vi.mock specifier resolves relative to THIS file, not to the subject. The
// subject sits in `src/helpers/fingerprint/`, so its `../x` is `src/helpers/x`;
// from `src/helpers/fingerprint/__tests__/` the same module is `../../x`. These
// paths used to be one directory short, so NONE of the mocks below applied and
// the extractor ran real unzip / tar / shell subprocesses until the 30s timeout.
vi.mock(
  '../../getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInArchive',
  () => ({
    default: vi.fn().mockRejectedValue(new Error('no archive in test')),
    detectTarVersion: vi.fn().mockResolvedValue('BSD'),
  })
);

vi.mock(
  '../../getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInDirectory',
  () => ({
    default: vi.fn().mockRejectedValue(new Error('no directory in test')),
  })
);

const mocks = vi.hoisted(() => ({ runShellCommand: vi.fn() }));

vi.mock('../../runShellCommand', () => ({
  default: mocks.runShellCommand,
}));

vi.mock('../../../commands/init/requirements/getPackageVersion', () => ({
  default: vi.fn().mockReturnValue(null),
}));

import { extractGateMetadata } from '../gateMetadata';
import { buildAxmlWithMetaData, type MetaData } from './support/axmlManifest';

/** An APK whose packaged manifest carries `metaData`: `unzip -p` answers it, nothing else does. */
function anApkWhoseManifestHolds(metaData: MetaData[]): void {
  mocks.runShellCommand.mockImplementation(async ({ command }: { command: string }) => {
    if (command.startsWith('unzip -p') && command.endsWith('AndroidManifest.xml')) {
      return buildAxmlWithMetaData(metaData);
    }
    throw new Error('no shell in test');
  });
}

/** Expo's own expo-updates entries, which stay in the manifest whatever ENABLED says. */
const EXPO_UPDATES_ENTRIES: MetaData[] = [
  { name: 'expo.modules.updates.EXPO_RUNTIME_VERSION', valueString: '1.0.0' },
  { name: 'expo.modules.updates.EXPO_UPDATE_URL', valueString: 'https://u.expo.dev/abc' },
  { name: 'expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH', valueString: 'ALWAYS' },
  { name: 'expo.modules.updates.EXPO_UPDATES_LAUNCH_WAIT_MS', valueString: '0' },
];

describe('extractGateMetadata (binary registration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runShellCommand.mockReset().mockRejectedValue(new Error('no shell in test'));
  });

  it('the gate facts of an app Sherlo built record that its build switched expo-updates off', async () => {
    // Sherlo's Android build sets ENABLED to false in the packaged manifest; Expo's
    // other entries stay where Expo's own transform put them, before it.
    anApkWhoseManifestHolds([
      ...EXPO_UPDATES_ENTRIES,
      { name: 'expo.modules.updates.ENABLED', valueBoolean: false },
    ]);

    const metadata = await extractGateMetadata({
      binaryPath: '/tmp/sherlo-built.apk',
      platform: 'android',
      projectRoot: '/tmp',
      bundlePath: 'assets/index.android.bundle',
    });

    expect(metadata.expoUpdatesEnabled).toBe(false);
  });

  it('reads expo-updates as off when ENABLED is false, whatever other updates entries the manifest keeps', async () => {
    for (const metaData of [
      [{ name: 'expo.modules.updates.ENABLED', valueString: 'false' }, ...EXPO_UPDATES_ENTRIES],
      [
        ...EXPO_UPDATES_ENTRIES.slice(0, 2),
        { name: 'expo.modules.updates.ENABLED', valueBoolean: false },
        ...EXPO_UPDATES_ENTRIES.slice(2),
      ],
      // No ENABLED entry at all: the others alone say nothing.
      EXPO_UPDATES_ENTRIES,
    ]) {
      anApkWhoseManifestHolds(metaData);

      const metadata = await extractGateMetadata({
        binaryPath: '/tmp/app.apk',
        platform: 'android',
        projectRoot: '/tmp',
        bundlePath: 'assets/index.android.bundle',
      });

      expect(metadata.expoUpdatesEnabled).toBe(false);
    }

    // ENABLED true still reads as on, so an app that ships updates is still refused.
    anApkWhoseManifestHolds([
      ...EXPO_UPDATES_ENTRIES,
      { name: 'expo.modules.updates.ENABLED', valueBoolean: true },
    ]);
    const enabled = await extractGateMetadata({
      binaryPath: '/tmp/app.apk',
      platform: 'android',
      projectRoot: '/tmp',
      bundlePath: 'assets/index.android.bundle',
    });
    expect(enabled.expoUpdatesEnabled).toBe(true);
  });

  it('marks metadata derivedFrom: binary', async () => {
    const metadata = await extractGateMetadata({
      binaryPath: '/tmp/whatever.apk',
      platform: 'android',
      projectRoot: '/tmp',
      bundlePath: 'assets/index.android.bundle',
    });

    expect(metadata.derivedFrom).toBe('binary');
    // Fail-soft defaults - the point is the marker, not these values.
    expect(metadata.buildMetadata?.buildMode).toBe('release');
  }, 30_000);
});
