/**
 * Tests for the test:bundled --dry-run preview (SHERLO-1895 Diff Scope Phase C).
 *
 * Covers the two contract-INDEPENDENT halves of the dry run:
 *   - formatDryRunPreview: the plain-text rendering of decided (partial + full)
 *     and bailed-open platforms, including that server reason strings are printed
 *     VERBATIM and that an isFullCapture=true result with an EMPTY
 *     capturedStoryFilePaths list renders as "capture EVERY story", never as
 *     "capture nothing".
 *   - runDryRunPreview: orchestration + bail-open. It issues ONE decision call
 *     for all platforms; a platform the server omits, or a query that throws,
 *     is previewed as "capture EVERY story" and is never dropped; the run never
 *     throws for a decision problem.
 *
 * The decision query itself (requestDryRunDecision) is the contract seam and is
 * mocked here - this suite asserts everything AROUND it. The seam's own mapping
 * onto the real contract is covered in dryRunDecision.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequestDryRunDecision } = vi.hoisted(() => ({
  mockRequestDryRunDecision: vi.fn(),
}));

vi.mock('../dryRunDecision', () => ({
  requestDryRunDecision: mockRequestDryRunDecision,
}));

vi.mock('../../../helpers/reporting', () => ({
  default: { addBreadcrumb: vi.fn() },
}));

import { formatDryRunPreview, runDryRunPreview, type DryRunPlatformPreview } from '../dryRun';
import type { DryRunPlatformDecision } from '../dryRunDecision';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A bundle whose only relevant field for the dry run is the module manifest. */
function bundleWithManifest(): any {
  return {
    moduleManifest: {
      raw: Buffer.from('{}'),
      parsed: { version: 1, header: {}, moduleHashes: {}, storyClosures: {} },
    },
  };
}

function bundleWithoutManifest(): any {
  return { moduleManifest: undefined };
}

/** The git info the CLI already built for openBuild - passed straight through. */
const gitInfo: any = { branchName: 'feature', commitHash: 'abc', commitName: 'msg' };

// ---------------------------------------------------------------------------
// formatDryRunPreview
// ---------------------------------------------------------------------------

describe('formatDryRunPreview', () => {
  it('renders a partial platform with its story-file list, count, and verbatim reason', () => {
    const decision: DryRunPlatformDecision = {
      platform: 'ios',
      isFullCapture: false,
      capturedStoryFilePaths: [
        'src/components/Storefront/Storefront.stories.tsx',
        'src/components/Cart/Cart.stories.tsx',
      ],
      totalStories: 5,
      reason: 'captured 2 - closure changed via src/components/Storefront/SharedButton.tsx',
    };

    const output = formatDryRunPreview([{ status: 'decided', decision }]);

    expect(output).toContain('Diff Scope preview - dry run (no build created)');
    // The fraction NAMES ITS UNIVERSE - "in this bundle", not the --include scope.
    expect(output).toContain('iOS - would capture 2 of 5 stories in this bundle');
    // Reused side (M - N = 3) is now shown alongside the captured side.
    expect(output).toContain('Would reuse the other 3');
    expect(output).toContain('• src/components/Storefront/Storefront.stories.tsx');
    expect(output).toContain('• src/components/Cart/Cart.stories.tsx');
    // Reason printed EXACTLY as the server returned it - no re-rendering.
    expect(output).toContain(
      'captured 2 - closure changed via src/components/Storefront/SharedButton.tsx'
    );
    expect(output).toContain('no build was created and nothing was uploaded');
  });

  it('renders a PARTIAL zero-capture as "nothing captured" with its verbatim reason', () => {
    const decision: DryRunPlatformDecision = {
      platform: 'android',
      isFullCapture: false,
      capturedStoryFilePaths: [],
      totalStories: 5,
      reason: 'captured 0 - no module changes reach any story',
    };

    const output = formatDryRunPreview([{ status: 'decided', decision }]);

    expect(output).toContain('Android - would capture 0 of 5 stories in this bundle');
    expect(output).toContain('so all 5 would be reused from the base build');
    expect(output).toContain('captured 0 - no module changes reach any story');
    // A partial-zero is NOT a full capture.
    expect(output).not.toContain('EVERY story');
  });

  it('renders a FULL capture (isFullCapture=true, EMPTY list) as "capture EVERY story", never "nothing"', () => {
    // Point 4 of the contract: isFullCapture=true means "would capture
    // EVERYTHING", and capturedStoryFilePaths is empty in that case. The empty
    // list must NOT be read as "captures nothing".
    const decision: DryRunPlatformDecision = {
      platform: 'ios',
      isFullCapture: true,
      capturedStoryFilePaths: [],
      totalStories: 12,
      reason: 'main-branch',
    };

    const output = formatDryRunPreview([{ status: 'decided', decision }]);

    expect(output).toContain('iOS - would capture EVERY story');
    expect(output).toContain('Reason: main-branch');
    // The dangerous misreads: never render the empty list as "nothing", and
    // never leak a "0 stories" / "Story files:" partial rendering.
    expect(output).not.toContain('capture nothing');
    expect(output).not.toContain('would capture 0');
    expect(output).not.toContain('Story files:');
  });

  it("renders a full capture from the server's in-band bail-open reason verbatim", () => {
    // The server bails open IN-BAND: isFullCapture=true + reason "dry-run-error: ...".
    const decision: DryRunPlatformDecision = {
      platform: 'android',
      isFullCapture: true,
      capturedStoryFilePaths: [],
      reason: 'dry-run-error: base ancestry lookup timed out',
    };

    const output = formatDryRunPreview([{ status: 'decided', decision }]);

    expect(output).toContain('Android - would capture EVERY story');
    expect(output).toContain('Reason: dry-run-error: base ancestry lookup timed out');
  });

  it('omits the "of M" total on a partial when the decision does not report one', () => {
    const decision: DryRunPlatformDecision = {
      platform: 'ios',
      isFullCapture: false,
      capturedStoryFilePaths: ['src/a/A.stories.tsx'],
      reason: 'captured 1 - closure changed via src/a/a.ts',
    };

    const output = formatDryRunPreview([{ status: 'decided', decision }]);

    expect(output).toContain('would capture 1 story');
    expect(output).not.toContain(' of ');
  });

  it('renders a bailed-open platform as "capture EVERY story" with its reason', () => {
    const previews: DryRunPlatformPreview[] = [
      { status: 'bailed-open', platform: 'ios', reason: 'network exploded' },
    ];

    const output = formatDryRunPreview(previews);

    expect(output).toContain('iOS - preview unavailable; a real run would capture EVERY story');
    expect(output).toContain('Reason: network exploded');
  });
});

// ---------------------------------------------------------------------------
// runDryRunPreview
// ---------------------------------------------------------------------------

describe('runDryRunPreview', () => {
  const client: any = { note: 'sdk-client stub' };

  it('issues ONE decision call for all platforms and prints the decided preview', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockRequestDryRunDecision.mockResolvedValue([
      {
        platform: 'ios',
        isFullCapture: false,
        capturedStoryFilePaths: ['src/App.stories.tsx'],
        totalStories: 3,
        reason: 'captured 1 - closure changed via src/App.tsx',
      },
    ] as DryRunPlatformDecision[]);

    await runDryRunPreview({
      client,
      bundles: { ios: bundleWithManifest() },
      platformsToTest: ['ios'],
      projectIndex: 7,
      teamId: 'team-42',
      gitInfo,
      baseReference: 'fp-123',
    });

    // The seam was called ONCE with the exact inputs it needs to issue the query.
    expect(mockRequestDryRunDecision).toHaveBeenCalledTimes(1);
    const arg = mockRequestDryRunDecision.mock.calls[0][0];
    expect(arg.client).toBe(client);
    expect(arg.projectIndex).toBe(7);
    expect(arg.teamId).toBe('team-42');
    expect(arg.gitInfo).toBe(gitInfo);
    expect(arg.platforms).toHaveLength(1);
    expect(arg.platforms[0].platform).toBe('ios');
    expect(arg.platforms[0].bundled).toBe(true);
    expect(arg.platforms[0].baseReference).toBe('fp-123');
    expect(arg.platforms[0].manifest.parsed.version).toBe(1);

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('iOS - would capture 1 of 3 stories');
    expect(printed).toContain('captured 1 - closure changed via src/App.tsx');

    logSpy.mockRestore();
  });

  it('sends a manifest-less platform through the SAME call (no local drop)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Server previews the manifest-less platform as manifest-missing (full).
    mockRequestDryRunDecision.mockResolvedValue([
      {
        platform: 'android',
        isFullCapture: true,
        capturedStoryFilePaths: [],
        reason: 'manifest-missing',
      },
    ] as DryRunPlatformDecision[]);

    await runDryRunPreview({
      client,
      bundles: { android: bundleWithoutManifest() },
      platformsToTest: ['android'],
      projectIndex: 1,
      teamId: 'team',
      gitInfo,
    });

    // Still ONE call - the platform is sent with an absent manifest, not dropped.
    expect(mockRequestDryRunDecision).toHaveBeenCalledTimes(1);
    const arg = mockRequestDryRunDecision.mock.calls[0][0];
    expect(arg.platforms).toHaveLength(1);
    expect(arg.platforms[0].platform).toBe('android');
    expect(arg.platforms[0].manifest).toBeUndefined();
    // No base fingerprint was passed -> baseReference omitted.
    expect(arg.platforms[0].baseReference).toBeUndefined();

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('Android - would capture EVERY story');
    expect(printed).toContain('Reason: manifest-missing');

    logSpy.mockRestore();
  });

  it('bails open for EVERY platform (never throws) when the decision query fails', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockRequestDryRunDecision.mockRejectedValue(new Error('network exploded'));

    await expect(
      runDryRunPreview({
        client,
        bundles: { ios: bundleWithManifest(), android: bundleWithManifest() },
        platformsToTest: ['ios', 'android'],
        projectIndex: 1,
        teamId: 'team',
        gitInfo,
      })
    ).resolves.toBeUndefined();

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('iOS - preview unavailable; a real run would capture EVERY story');
    expect(printed).toContain(
      'Android - preview unavailable; a real run would capture EVERY story'
    );
    expect(printed).toContain('network exploded');

    logSpy.mockRestore();
  });

  it('bails open only the platform the server omitted from its results', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockRequestDryRunDecision.mockResolvedValue([
      {
        platform: 'ios',
        isFullCapture: false,
        capturedStoryFilePaths: ['src/x/X.stories.tsx'],
        reason: 'captured 1 - closure changed via src/x.tsx',
      },
      // android intentionally absent from the server's results.
    ] as DryRunPlatformDecision[]);

    await runDryRunPreview({
      client,
      bundles: { ios: bundleWithManifest(), android: bundleWithManifest() },
      platformsToTest: ['ios', 'android'],
      projectIndex: 1,
      teamId: 'team',
      gitInfo,
    });

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('iOS - would capture 1 story');
    expect(printed).toContain(
      'Android - preview unavailable; a real run would capture EVERY story'
    );
    expect(printed).toContain('the dry-run decision returned no result for this platform');

    logSpy.mockRestore();
  });

  it('renders a mix: one platform partial, one full', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockRequestDryRunDecision.mockResolvedValue([
      {
        platform: 'ios',
        isFullCapture: false,
        capturedStoryFilePaths: ['src/x/X.stories.tsx'],
        totalStories: 4,
        reason: 'captured 1 - closure changed via src/x.tsx',
      },
      {
        platform: 'android',
        isFullCapture: true,
        capturedStoryFilePaths: [],
        reason: 'native-changed',
      },
    ] as DryRunPlatformDecision[]);

    await runDryRunPreview({
      client,
      bundles: { ios: bundleWithManifest(), android: bundleWithManifest() },
      platformsToTest: ['ios', 'android'],
      projectIndex: 1,
      teamId: 'team',
      gitInfo,
    });

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('iOS - would capture 1 of 4 stories');
    expect(printed).toContain('• src/x/X.stories.tsx');
    expect(printed).toContain('Android - would capture EVERY story');
    expect(printed).toContain('Reason: native-changed');

    logSpy.mockRestore();
  });
});
