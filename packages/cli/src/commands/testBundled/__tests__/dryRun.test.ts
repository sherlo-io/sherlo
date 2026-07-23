/**
 * Tests for the test:bundled --dry-run capture-plan preview (SHERLO-1919, format
 * replacing SHERLO-1895/1915).
 *
 * Covers the two contract-INDEPENDENT halves of the dry run:
 *   - formatDryRunPreview: the plain-text rendering of decided (partial + full)
 *     and bailed-open platforms, including that server reason strings are printed
 *     VERBATIM, that an isFullCapture=true result with an EMPTY
 *     capturedStoryFilePaths list renders as "would capture all N stories" (never
 *     "nothing"), and that the "◦ Dry run" closer is appended.
 *   - runDryRunPreview: orchestration + bail-open. It issues ONE decision call for
 *     all platforms; a platform the server omits, or a query that throws, is
 *     previewed as "would capture all stories" (bail-open safety) and never
 *     dropped; the run never throws for a decision problem.
 *
 * The decision query itself (requestDryRunDecision) is the contract seam and is
 * mocked here - this suite asserts everything AROUND it.
 */
import chalk from 'chalk';
chalk.level = 0;

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
  it('Case 6: renders a partial platform verbatim, closing with the dry-run notice', () => {
    const decision: DryRunPlatformDecision = {
      platform: 'android',
      isFullCapture: false,
      capturedStoryFilePaths: [
        'src/components/Storefront/CheckoutScreen.stories.tsx',
        'src/components/Storefront/PriceTag.stories.tsx',
        'src/components/Storefront/PriceTagInline.stories.tsx',
        'src/components/Storefront/ProductCard.stories.tsx',
        'src/components/Storefront/ProductCardCompact.stories.tsx',
        'src/components/Storefront/SharedButton.stories.tsx',
      ],
      totalStories: 22,
      reason: 'SharedButton.tsx changed',
    };

    const output = formatDryRunPreview([{ status: 'decided', decision }]);

    expect(output).toBe(
      [
        '📸 Capture plan (dry run)',
        '  🤖 Android - would capture 6 of 22 stories, reusing 16 from the previous build',
        '     why: SharedButton.tsx changed',
        '     stories:',
        '       • Storefront/CheckoutScreen',
        '       • Storefront/PriceTag',
        '       • Storefront/PriceTagInline',
        '       • Storefront/ProductCard',
        '       • Storefront/ProductCardCompact',
        '       • Storefront/SharedButton',
        '',
        '◦ Dry run - no build created, nothing uploaded',
      ].join('\n')
    );
  });

  it('renders a PARTIAL zero-capture as "nothing to capture" with its verbatim reason', () => {
    const decision: DryRunPlatformDecision = {
      platform: 'android',
      isFullCapture: false,
      capturedStoryFilePaths: [],
      totalStories: 5,
      reason: 'no change reaches any story',
    };

    const output = formatDryRunPreview([{ status: 'decided', decision }]);

    expect(output).toContain('🤖 Android - nothing to capture - no change reaches any story');
    expect(output).toContain('     ✓ all 5 stories reused from the previous build');
    // A partial-zero has no capture verb at all.
    expect(output).not.toContain('would capture');
  });

  it('renders a FULL capture (isFullCapture=true, EMPTY list) as "would capture all N stories"', () => {
    const decision: DryRunPlatformDecision = {
      platform: 'ios',
      isFullCapture: true,
      capturedStoryFilePaths: [],
      totalStories: 12,
      reason: 'main-branch',
    };

    const output = formatDryRunPreview([{ status: 'decided', decision }]);

    expect(output).toContain('🍎 iOS - would capture all 12 stories');
    expect(output).toContain('     why: main-branch');
    // The dangerous misreads: never render the empty list as "nothing".
    expect(output).not.toContain('nothing to capture');
    expect(output).not.toContain('would capture 0');
    expect(output).not.toContain('stories:');
  });

  it("renders a full capture from the server's in-band bail-open reason verbatim", () => {
    // The server bails open IN-BAND: isFullCapture=true + reason "dry-run-error: ...".
    const decision: DryRunPlatformDecision = {
      platform: 'android',
      isFullCapture: true,
      capturedStoryFilePaths: [],
      totalStories: 8,
      reason: 'dry-run-error: base ancestry lookup timed out',
    };

    const output = formatDryRunPreview([{ status: 'decided', decision }]);

    expect(output).toContain('🤖 Android - would capture all 8 stories');
    expect(output).toContain('     why: dry-run-error: base ancestry lookup timed out');
  });

  it('omits the "of M" total on a partial when the decision does not report one', () => {
    const decision: DryRunPlatformDecision = {
      platform: 'ios',
      isFullCapture: false,
      capturedStoryFilePaths: ['src/components/a/A.stories.tsx'],
      reason: 'a.ts changed',
    };

    const output = formatDryRunPreview([{ status: 'decided', decision }]);

    expect(output).toContain('would capture 1 story');
    expect(output).not.toContain(' of ');
  });

  it('renders a bailed-open platform as "would capture all stories" with the couldn\'t-compute row', () => {
    const previews: DryRunPlatformPreview[] = [
      { status: 'bailed-open', platform: 'ios', reason: 'network exploded' },
    ];

    const output = formatDryRunPreview(previews);

    expect(output).toContain('🍎 iOS - would capture all stories');
    expect(output).toContain(
      "     ! couldn't compute what changed - capturing everything to be safe"
    );
    // The raw error stays in telemetry, not on the user's line.
    expect(output).not.toContain('network exploded');
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
        capturedStoryFilePaths: ['src/components/App/App.stories.tsx'],
        totalStories: 3,
        reason: 'App.tsx changed',
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
    expect(printed).toContain(
      '🍎 iOS - would capture 1 of 3 stories, reusing 2 from the previous build'
    );
    expect(printed).toContain('why: App.tsx changed');
    expect(printed).toContain('◦ Dry run - no build created, nothing uploaded');

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
    // No manifest total -> full capture degrades to "all stories" (no number).
    expect(printed).toContain('🤖 Android - would capture all stories');
    expect(printed).toContain('why: manifest-missing');

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
    expect(printed).toContain('🍎 iOS - would capture all stories');
    expect(printed).toContain('🤖 Android - would capture all stories');
    expect(printed).toContain("! couldn't compute what changed - capturing everything to be safe");
    // The raw error is telemetry-only, never on the user's line.
    expect(printed).not.toContain('network exploded');

    logSpy.mockRestore();
  });

  it('bails open only the platform the server omitted from its results', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockRequestDryRunDecision.mockResolvedValue([
      {
        platform: 'ios',
        isFullCapture: false,
        capturedStoryFilePaths: ['src/components/x/X.stories.tsx'],
        reason: 'x.tsx changed',
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
    expect(printed).toContain('🍎 iOS - would capture 1 story');
    expect(printed).toContain('🤖 Android - would capture all stories');

    logSpy.mockRestore();
  });

  it('renders a mix: one platform partial, one full', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockRequestDryRunDecision.mockResolvedValue([
      {
        platform: 'ios',
        isFullCapture: false,
        capturedStoryFilePaths: ['src/components/x/X.stories.tsx'],
        totalStories: 4,
        reason: 'x.tsx changed',
      },
      {
        platform: 'android',
        isFullCapture: true,
        capturedStoryFilePaths: [],
        totalStories: 4,
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
    expect(printed).toContain(
      '🍎 iOS - would capture 1 of 4 stories, reusing 3 from the previous build'
    );
    expect(printed).toContain('• x/X');
    expect(printed).toContain('🤖 Android - would capture all 4 stories');
    expect(printed).toContain('why: native-changed');

    logSpy.mockRestore();
  });
});
