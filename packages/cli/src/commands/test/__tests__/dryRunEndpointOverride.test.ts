/**
 * SITE TWO, proven past the seam that hid it TWICE (architect review, sherlo#293).
 *
 * The first pass at this test built the SDK client itself - `sdkClient(tokens,
 * getEndpointUrl())` - and handed it straight to `runDryRunPreview`. That proves the
 * plumbing BELOW the client (the decision query, the bail-open) honours whatever client it is
 * given, but it can never catch a regression in the ONE line that matters: `stagedRun.ts`
 * constructing that client without the endpoint argument again. A test that builds its own
 * (correct) client can pass forever while the shipped command silently drops the override.
 *
 * This test drives `stagedRun` itself - the real `sherlo test --dry-run` entry point - so the
 * client is the ONE `stagedRun.ts` builds, not a stand-in. Only the parts that would make this
 * slow or non-deterministic are replaced: command-line validation, git, the base fingerprint,
 * and the bundler. The decision query, the SDK client, and the address it dials are real. It
 * points `SHERLO_API_URL` at a loopback port nothing listens on and asserts the printed plan
 * says it could not tell - never the server's own "first build" reading of a fresh project,
 * which is what a dropped override would actually produce (the real default server would
 * answer, honestly, about the wrong project).
 */
const {
  mockGetValidatedCommandParams,
  mockGetGitInfo,
  mockComputeBaseFingerprint,
  mockBuildBundleForPlatform,
  mockBuildGateMetadata,
} = vi.hoisted(() => ({
  mockGetValidatedCommandParams: vi.fn(),
  mockGetGitInfo: vi.fn(),
  mockComputeBaseFingerprint: vi.fn(),
  mockBuildBundleForPlatform: vi.fn(),
  mockBuildGateMetadata: vi.fn(),
}));

// Only command-line validation and the git read are stood in for - everything else this pulls
// in from '../../../helpers' (getTokenParts, getPlatformsToTest, printSherloIntro, reporting, …)
// stays real.
vi.mock('../../../helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../helpers')>()),
  getValidatedCommandParams: mockGetValidatedCommandParams,
  getGitInfo: mockGetGitInfo,
}));

// The base fingerprint is real @expo/fingerprint work against this machine's own tree - replaced
// with a fixed value, exactly as it plays no part in which address the decision query dials.
vi.mock('../../../helpers/fingerprint', () => ({
  computeBaseFingerprint: mockComputeBaseFingerprint,
}));

// The bundler is real Metro/expo work - replaced with a fixed manifest. Everything downstream of
// it (buildBundles, runDryRunPreview, requestDryRunDecision, the sdk client) is real.
vi.mock('../buildBundle', () => ({
  buildBundleForPlatform: mockBuildBundleForPlatform,
  buildGateMetadata: mockBuildGateMetadata,
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stagedRun from '../stagedRun';

// A loopback port nothing listens on: the connection is refused immediately (no timeout to
// wait out), which is what makes this test fast AND deterministic in any sandbox - no real
// network egress, just a local TCP RST.
const NOTHING_LISTENS_HERE = 'http://127.0.0.1:1/graphql';

// A well-shaped PROJECT token (32-char api token + 8-char team id + project index) - real
// `getTokenParts` slices it apart, so it must be the real shape, not a placeholder string.
const PROJECT_TOKEN = `${'a'.repeat(32)}teamteam1`;

const originalApiUrl = process.env.SHERLO_API_URL;

beforeEach(() => {
  vi.clearAllMocks();

  // The exact override the real e2e beat sets (sherlo-tester's `apiUnreachable`,
  // UNROUTABLE_API_URL) - reading it through the tool's OWN `getEndpointUrl()` call, inside
  // `stagedRun.ts`, is what proves the command's own resolution is under test here.
  process.env.SHERLO_API_URL = NOTHING_LISTENS_HERE;

  mockGetValidatedCommandParams.mockReturnValue({
    projectRoot: '/proj',
    token: PROJECT_TOKEN,
    devices: [
      { id: 'iphone.14', osVersion: '17.0', theme: 'light', locale: 'en', fontScale: '1.0' },
    ],
    wait: false,
  } as any);

  mockGetGitInfo.mockResolvedValue({ branchName: 'feature', commitHash: 'abc', commitName: 'msg' });

  mockComputeBaseFingerprint.mockResolvedValue({ hash: 'fp-123' });

  mockBuildBundleForPlatform.mockResolvedValue({
    bundlePath: '/tmp/bundle.ios.js',
    bundleFormat: 'plain-js',
    bundleSizeMb: 1,
    bundleHash: 'abc123',
    assetInventory: [],
    bundler: 'expo',
    moduleManifest: {
      raw: Buffer.from('{}'),
      parsed: { version: 1, header: {}, moduleHashes: {}, storyClosures: {} },
    },
  } as any);
  mockBuildGateMetadata.mockResolvedValue({ engineClass: 'hermes' } as any);
});

afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.SHERLO_API_URL;
  else process.env.SHERLO_API_URL = originalApiUrl;
});

describe('the dry-run decision honours an endpoint override end to end', () => {
  it('a dry run sends its capture decision to the address the tool was pointed at', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await stagedRun({ dryRun: true } as any);

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('🍎 iOS - would capture all stories');
    expect(printed).toContain("! couldn't compute what changed - capturing everything to be safe");
    expect(printed).not.toContain('first build');
    expect(printed).not.toContain('in this bundle');

    logSpy.mockRestore();
  }, 15_000);
});
