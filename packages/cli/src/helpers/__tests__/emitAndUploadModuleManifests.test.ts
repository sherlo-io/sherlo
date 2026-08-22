/**
 * Tests for test:standard's module-manifest producer pass (SHERLO-1943).
 *
 * Covers:
 *  - assessManifestProvenance: the hard provenance guard (clean tree + known
 *    commit) that decides emit vs skip.
 *  - emitAndUploadModuleManifests: REUSES buildBundleForPlatform (the exact
 *    test:bundled producer) - never a second implementation - gzips + PUTs
 *    the manifest via the SAME putBuffer testBundled's uploadStagedArtifacts
 *    uses, and mirrors manifestS3Key per platform.
 *  - Fail-soft: a bundling error, a missing upload slot, or a PUT failure
 *    never throws - it degrades to "no manifest for that platform".
 *  - Cost budget: when provenance is not vouched, buildBundleForPlatform is
 *    never called at all (no wasted bundling pass).
 */
import chalk from 'chalk';
chalk.level = 0;

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitInfo } from '../getGitInfo';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  buildBundleForPlatform: vi.fn(),
  putBuffer: vi.fn(),
  logWarning: vi.fn(),
}));

vi.mock('../../commands/test/buildBundle', () => ({
  buildBundleForPlatform: mocks.buildBundleForPlatform,
}));

vi.mock('../../commands/test/uploadStagedArtifacts', () => ({
  putBuffer: mocks.putBuffer,
}));

vi.mock('../logWarning', () => ({ default: mocks.logWarning }));

import {
  assessManifestProvenance,
  emitAndUploadModuleManifests,
} from '../emitAndUploadModuleManifests';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function gitInfo(overrides: Partial<GitInfo> = {}): GitInfo {
  return {
    commitName: 'feat: my change',
    commitHash: 'deadbeef',
    branchName: 'my-branch',
    isDirty: false,
    ...overrides,
  };
}

function manifest(raw = 'manifest-bytes') {
  return {
    raw: Buffer.from(raw, 'utf8'),
    parsed: {
      version: 1,
      header: { metroVersion: '0.81.0' },
      moduleHashes: {},
      storyClosures: {},
    },
  };
}

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    getStagedUploadUrls: vi.fn().mockResolvedValue({
      stagedPresignedUploadUrls: {
        android: { manifest: { url: 'http://s3/android-manifest', s3Key: 'android-manifest-key' } },
        ios: { manifest: { url: 'http://s3/ios-manifest', s3Key: 'ios-manifest-key' } },
      },
    }),
    ...overrides,
  } as any;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.putBuffer.mockResolvedValue(undefined);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// assessManifestProvenance - the hard guard
// ---------------------------------------------------------------------------

describe('assessManifestProvenance', () => {
  it('vouches for a clean tree with known commit metadata', () => {
    expect(assessManifestProvenance(gitInfo())).toEqual({ vouched: true });
  });

  it('refuses a dirty working tree', () => {
    const result = assessManifestProvenance(gitInfo({ isDirty: true }));
    expect(result.vouched).toBe(false);
    if (!result.vouched) expect(result.reason).toContain('dirty');
  });

  it('refuses when dirtiness could not be determined (isDirty undefined)', () => {
    const result = assessManifestProvenance(gitInfo({ isDirty: undefined }));
    expect(result.vouched).toBe(false);
    if (!result.vouched) expect(result.reason).toContain('could not be determined');
  });

  it('refuses the "unknown" commitHash sentinel even on a clean tree', () => {
    const result = assessManifestProvenance(
      gitInfo({ commitHash: 'unknown', commitName: 'unknown', isDirty: false })
    );
    expect(result.vouched).toBe(false);
    if (!result.vouched) expect(result.reason).toContain('commit metadata');
  });

  it('refuses the "unknown" commitName sentinel even on a clean tree', () => {
    const result = assessManifestProvenance(gitInfo({ commitName: 'unknown' }));
    expect(result.vouched).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// emitAndUploadModuleManifests - provenance-gated cost budget
// ---------------------------------------------------------------------------

describe('emitAndUploadModuleManifests - provenance skip', () => {
  it('never calls buildBundleForPlatform when provenance is not vouched (no wasted bundling pass)', async () => {
    const client = fakeClient();

    const result = await emitAndUploadModuleManifests({
      client,
      projectRoot: '/proj',
      platforms: ['android', 'ios'],
      gitInfo: gitInfo({ isDirty: true }),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(result).toEqual({});
    expect(mocks.buildBundleForPlatform).not.toHaveBeenCalled();
    expect(client.getStagedUploadUrls).not.toHaveBeenCalled();
  });

  it('prints exactly one plain line stating the skip reason', async () => {
    await emitAndUploadModuleManifests({
      client: fakeClient(),
      projectRoot: '/proj',
      platforms: ['ios'],
      gitInfo: gitInfo({ isDirty: true }),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(mocks.logWarning).toHaveBeenCalledTimes(1);
    const { message } = mocks.logWarning.mock.calls[0][0];
    expect(message).toContain('Module manifest skipped');
    expect(message).toContain('dirty');
  });

  it('returns {} and does nothing when there are no platforms', async () => {
    const client = fakeClient();
    const result = await emitAndUploadModuleManifests({
      client,
      projectRoot: '/proj',
      platforms: [],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(result).toEqual({});
    expect(mocks.buildBundleForPlatform).not.toHaveBeenCalled();
    expect(client.getStagedUploadUrls).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// emitAndUploadModuleManifests - vouched emit path
// ---------------------------------------------------------------------------

describe('emitAndUploadModuleManifests - vouched emit', () => {
  it('calls buildBundleForPlatform with the EXACT test:bundled signature, per platform', async () => {
    mocks.buildBundleForPlatform.mockResolvedValue({ moduleManifest: manifest() });

    await emitAndUploadModuleManifests({
      client: fakeClient(),
      projectRoot: '/proj',
      platforms: ['android', 'ios'],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(mocks.buildBundleForPlatform).toHaveBeenCalledTimes(2);
    expect(mocks.buildBundleForPlatform).toHaveBeenCalledWith({
      projectRoot: '/proj',
      platform: 'android',
    });
    expect(mocks.buildBundleForPlatform).toHaveBeenCalledWith({
      projectRoot: '/proj',
      platform: 'ios',
    });
  });

  it('requests staged upload slots ONLY for platforms that produced a manifest', async () => {
    mocks.buildBundleForPlatform.mockImplementation(async ({ platform }: { platform: string }) => ({
      moduleManifest: platform === 'ios' ? manifest() : undefined,
    }));
    const client = fakeClient();

    await emitAndUploadModuleManifests({
      client,
      projectRoot: '/proj',
      platforms: ['android', 'ios'],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(client.getStagedUploadUrls).toHaveBeenCalledWith({
      platforms: ['ios'],
      projectIndex: 1,
      teamId: 'team',
    });
  });

  it('gzips the manifest raw bytes and PUTs them via the shared putBuffer', async () => {
    const m = manifest('exact-raw-bytes');
    mocks.buildBundleForPlatform.mockResolvedValue({ moduleManifest: m });

    await emitAndUploadModuleManifests({
      client: fakeClient(),
      projectRoot: '/proj',
      platforms: ['ios'],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(mocks.putBuffer).toHaveBeenCalledTimes(1);
    const call = mocks.putBuffer.mock.calls[0][0];
    expect(call.platform).toBe('ios');
    expect(call.uploadUrl).toBe('http://s3/ios-manifest');
    // gzip, not raw bytes verbatim.
    expect(call.buffer.equals(m.raw)).toBe(false);
    const zlib = await import('zlib');
    expect(zlib.gunzipSync(call.buffer).equals(m.raw)).toBe(true);
  });

  it('prints the house-style step line + a per-platform success checkmark (verbatim, no .snap)', async () => {
    mocks.buildBundleForPlatform.mockResolvedValue({ moduleManifest: manifest() });

    await emitAndUploadModuleManifests({
      client: fakeClient(),
      projectRoot: '/proj',
      platforms: ['ios'],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    const lines = logSpy.mock.calls.map((c: unknown[]) => c.join(' '));
    expect(lines).toContain('\n📄 Producing the module manifest for Diff Scope...');
    expect(lines).toContain('  ✓ iOS module manifest uploaded');
  });

  it('returns the manifestS3Key per platform - mirrors testBundled.ts wiring exactly', async () => {
    mocks.buildBundleForPlatform.mockResolvedValue({ moduleManifest: manifest() });

    const result = await emitAndUploadModuleManifests({
      client: fakeClient(),
      projectRoot: '/proj',
      platforms: ['android', 'ios'],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(result).toEqual({ android: 'android-manifest-key', ios: 'ios-manifest-key' });
  });

  it('prints the skip warning as the ONLY console-facing call when nothing is uploaded', async () => {
    // No manifest at all -> bail-open silently past the provenance line (which
    // did not fire here, since provenance WAS vouched); no network call either.
    mocks.buildBundleForPlatform.mockResolvedValue({ moduleManifest: undefined });
    const client = fakeClient();

    const result = await emitAndUploadModuleManifests({
      client,
      projectRoot: '/proj',
      platforms: ['android'],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(result).toEqual({});
    expect(client.getStagedUploadUrls).not.toHaveBeenCalled();
    expect(mocks.logWarning).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fail-soft: never throws, always degrades
// ---------------------------------------------------------------------------

describe('emitAndUploadModuleManifests - fail-soft', () => {
  it('swallows a buildBundleForPlatform rejection for one platform, still emits the other', async () => {
    mocks.buildBundleForPlatform.mockImplementation(async ({ platform }: { platform: string }) => {
      if (platform === 'android') throw new Error('bundler exploded');
      return { moduleManifest: manifest() };
    });

    const result = await emitAndUploadModuleManifests({
      client: fakeClient(),
      projectRoot: '/proj',
      platforms: ['android', 'ios'],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(result).toEqual({ ios: 'ios-manifest-key' });
    expect(mocks.logWarning).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('bundler exploded') })
    );
  });

  it('swallows a getStagedUploadUrls rejection and returns {}', async () => {
    mocks.buildBundleForPlatform.mockResolvedValue({ moduleManifest: manifest() });
    const client = fakeClient({
      getStagedUploadUrls: vi.fn().mockRejectedValue(new Error('network down')),
    });

    const result = await emitAndUploadModuleManifests({
      client,
      projectRoot: '/proj',
      platforms: ['ios'],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(result).toEqual({});
    expect(mocks.logWarning).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('network down') })
    );
  });

  it('swallows a putBuffer rejection for one platform, still emits the other', async () => {
    mocks.buildBundleForPlatform.mockResolvedValue({ moduleManifest: manifest() });
    mocks.putBuffer.mockImplementation(async ({ platform }: { platform: string }) => {
      if (platform === 'android') throw new Error('S3 PUT failed');
    });

    const result = await emitAndUploadModuleManifests({
      client: fakeClient(),
      projectRoot: '/proj',
      platforms: ['android', 'ios'],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(result).toEqual({ ios: 'ios-manifest-key' });
    expect(mocks.logWarning).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('S3 PUT failed') })
    );
  });

  it('skips a platform whose upload-slot response has no manifest entry (bail-open)', async () => {
    mocks.buildBundleForPlatform.mockResolvedValue({ moduleManifest: manifest() });
    const client = fakeClient({
      getStagedUploadUrls: vi.fn().mockResolvedValue({
        stagedPresignedUploadUrls: { ios: {} }, // no `.manifest` slot - old API
      }),
    });

    const result = await emitAndUploadModuleManifests({
      client,
      projectRoot: '/proj',
      platforms: ['ios'],
      gitInfo: gitInfo(),
      projectIndex: 1,
      teamId: 'team',
    });

    expect(result).toEqual({});
    expect(mocks.putBuffer).not.toHaveBeenCalled();
  });
});
