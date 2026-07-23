/**
 * Tests for the dry-run decision contract seam (SHERLO-1895 Diff Scope Phase C).
 *
 * requestDryRunDecision is the ONE place bound to the server's
 * `computeDiffScopeDryRun` query. This suite pins the seam's behaviour against
 * the real contract:
 *   - it issues ONE call carrying the platforms array (not one call per platform);
 *   - it maps each build's manifest to the JSON-string `manifest` input and omits
 *     an absent one; it omits an absent/empty baseReference;
 *   - it derives "M" (totalStories) from the LOCAL manifest story-closure count,
 *     since the contract has no server total field;
 *   - it passes isFullCapture / reason / capturedStoryFilePaths straight through;
 *   - it THROWS (so the caller bails open) when the query method is absent at
 *     runtime, or the result is null / malformed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../helpers/reporting', () => ({
  default: { addBreadcrumb: vi.fn() },
}));

import {
  requestDryRunDecision,
  DRY_RUN_DECISION_UNAVAILABLE,
  type DryRunPlatformRequest,
} from '../dryRunDecision';

beforeEach(() => {
  vi.clearAllMocks();
});

const gitInfo: any = { branchName: 'feature', commitHash: 'abc', commitName: 'msg' };

/** A validated manifest whose story-closure count is `storyCount`. */
function manifest(storyCount: number, bytes = '{"v":1}'): any {
  const storyClosures: Record<string, unknown> = {};
  for (let i = 0; i < storyCount; i++) storyClosures[`story-${i}`] = {};
  return {
    raw: Buffer.from(bytes),
    parsed: { version: 1, header: {}, moduleHashes: {}, storyClosures },
  };
}

function clientWith(computeDiffScopeDryRun: any): any {
  return { computeDiffScopeDryRun };
}

describe('requestDryRunDecision', () => {
  it('issues one call with the mapped platforms array and returns mapped decisions', async () => {
    const query = vi.fn().mockResolvedValue({
      platforms: [
        {
          platform: 'ios',
          isFullCapture: false,
          reason: 'captured 1 - closure changed via src/App.tsx',
          capturedStoryFilePaths: ['src/App.stories.tsx'],
        },
        {
          platform: 'android',
          isFullCapture: true,
          reason: 'native-changed',
          capturedStoryFilePaths: [],
        },
      ],
    });

    const platforms: DryRunPlatformRequest[] = [
      { platform: 'ios', bundled: true, baseReference: 'fp-1', manifest: manifest(3, '{"ios":1}') },
      { platform: 'android', bundled: true, manifest: undefined },
    ];

    const decisions = await requestDryRunDecision({
      client: clientWith(query),
      gitInfo,
      projectIndex: 9,
      teamId: 'team-x',
      platforms,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const vars = query.mock.calls[0][0];
    expect(vars.projectIndex).toBe(9);
    expect(vars.teamId).toBe('team-x');
    expect(vars.gitInfo).toBe(gitInfo);
    expect(vars.platforms).toHaveLength(2);

    // iOS: base + manifest string carried through verbatim.
    const iosInput = vars.platforms.find((p: any) => p.platform === 'ios');
    expect(iosInput.bundled).toBe(true);
    expect(iosInput.baseReference).toBe('fp-1');
    expect(iosInput.manifest).toBe('{"ios":1}');

    // Android: no manifest, no base -> both fields omitted (not sent as undefined-ish empties).
    const androidInput = vars.platforms.find((p: any) => p.platform === 'android');
    expect('manifest' in androidInput).toBe(false);
    expect('baseReference' in androidInput).toBe(false);

    // Mapped decisions: passthrough + locally-derived totalStories.
    const ios = decisions.find((d) => d.platform === 'ios')!;
    expect(ios.isFullCapture).toBe(false);
    expect(ios.capturedStoryFilePaths).toEqual(['src/App.stories.tsx']);
    expect(ios.reason).toBe('captured 1 - closure changed via src/App.tsx');
    expect(ios.totalStories).toBe(3); // from the manifest's 3 story closures

    const android = decisions.find((d) => d.platform === 'android')!;
    expect(android.isFullCapture).toBe(true);
    expect(android.totalStories).toBeUndefined(); // no manifest -> no local M
  });

  it('omits an empty baseReference', async () => {
    const query = vi.fn().mockResolvedValue({ platforms: [] });
    await requestDryRunDecision({
      client: clientWith(query),
      gitInfo,
      projectIndex: 1,
      teamId: 't',
      platforms: [{ platform: 'ios', bundled: true, baseReference: '', manifest: manifest(1) }],
    });
    const iosInput = query.mock.calls[0][0].platforms[0];
    expect('baseReference' in iosInput).toBe(false);
  });

  it('throws (caller bails open) when the query method is absent at runtime', async () => {
    await expect(
      requestDryRunDecision({
        client: clientWith(undefined),
        gitInfo,
        projectIndex: 1,
        teamId: 't',
        platforms: [{ platform: 'ios', bundled: true, manifest: manifest(1) }],
      })
    ).rejects.toThrow(DRY_RUN_DECISION_UNAVAILABLE);
  });

  it('throws (caller bails open) when the result is null', async () => {
    const query = vi.fn().mockResolvedValue(null);
    await expect(
      requestDryRunDecision({
        client: clientWith(query),
        gitInfo,
        projectIndex: 1,
        teamId: 't',
        platforms: [{ platform: 'ios', bundled: true, manifest: manifest(1) }],
      })
    ).rejects.toThrow(/no platform results/);
  });

  it('propagates a transport error (caller bails open)', async () => {
    const query = vi.fn().mockRejectedValue(new Error('network exploded'));
    await expect(
      requestDryRunDecision({
        client: clientWith(query),
        gitInfo,
        projectIndex: 1,
        teamId: 't',
        platforms: [{ platform: 'ios', bundled: true, manifest: manifest(1) }],
      })
    ).rejects.toThrow('network exploded');
  });
});
