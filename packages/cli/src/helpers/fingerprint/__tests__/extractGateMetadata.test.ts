/**
 * test:standard binary-derivation regression (SHERLO-1760).
 *
 * extractGateMetadata is the ONLY gate-metadata constructor for the test:standard
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

vi.mock(
  '../getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInArchive',
  () => ({
    default: vi.fn().mockRejectedValue(new Error('no archive in test')),
    detectTarVersion: vi.fn().mockResolvedValue('BSD'),
  })
);

vi.mock(
  '../getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInDirectory',
  () => ({
    default: vi.fn().mockRejectedValue(new Error('no directory in test')),
  })
);

vi.mock('../runShellCommand', () => ({
  default: vi.fn().mockRejectedValue(new Error('no shell in test')),
}));

vi.mock('../../commands/init/requirements/getPackageVersion', () => ({
  default: vi.fn().mockReturnValue(null),
}));

import { extractGateMetadata } from '../gateMetadata';

describe('extractGateMetadata (test:standard = binary)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
