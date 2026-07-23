/**
 * Tests for the shared Diff Scope report renderer (SHERLO-1915).
 *
 * This is the ONE formatter both the live run and the --dry-run preview print
 * through, so the assertions here are the load-bearing ones:
 *   - the inversion pin: a FULL capture with an EMPTY captured-file list renders
 *     as "EVERY story", NEVER "nothing" (Deliverable 3);
 *   - tense parity: the live and dry-run blocks are byte-identical once the tense
 *     words are normalised, asserted DIRECTLY against the formatter rather than by
 *     eyeballing two snapshots (Deliverable 5.5);
 *   - the reused side and the "N of M stories in this bundle" relabel that names
 *     the fraction's universe (Deliverable 4).
 */
import { describe, expect, it } from 'vitest';
import {
  formatDiffScopeBlock,
  formatDiffScopeReport,
  type DiffScopePlatformReport,
} from '../diffScopeReport';

type DecidedBlock = Extract<DiffScopePlatformReport, { kind: 'decided' }>;

function decided(overrides: Partial<DecidedBlock> = {}): DecidedBlock {
  return {
    kind: 'decided',
    platform: 'ios',
    full: false,
    capturedStoryFilePaths: [],
    totalStoriesInBundle: undefined,
    reason: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatDiffScopeBlock - the shared per-platform core
// ---------------------------------------------------------------------------

describe('formatDiffScopeBlock', () => {
  it('renders a partial capture with its fraction, reused side, story list, and verbatim reason', () => {
    const block = decided({
      platform: 'ios',
      full: false,
      capturedStoryFilePaths: [
        'src/components/Storefront/Storefront.stories.tsx',
        'src/components/Cart/Cart.stories.tsx',
      ],
      totalStoriesInBundle: 22,
      reason: 'captured 2 - closure changed via src/components/Storefront/SharedButton.tsx',
    });

    const live = formatDiffScopeBlock(block, 'captured').join('\n');

    // The fraction NAMES ITS UNIVERSE - "in this bundle", not the --include scope.
    expect(live).toContain('🍎 iOS - captured 2 of 22 stories in this bundle');
    // Reused = M - N = 20, shown as its own line.
    expect(live).toContain(
      'Reused the other 20 (already photographed on the base build, not re-shot here).'
    );
    expect(live).toContain('Stories captured:');
    expect(live).toContain('• src/components/Storefront/Storefront.stories.tsx');
    expect(live).toContain('• src/components/Cart/Cart.stories.tsx');
    // Reason is byte-for-byte the server string.
    expect(live).toContain(
      'Reason: captured 2 - closure changed via src/components/Storefront/SharedButton.tsx'
    );
  });

  it('THE INVERSION PIN: a FULL capture with an EMPTY list renders "EVERY story", never "nothing"', () => {
    // full: true is "everything"; the empty capturedStoryFilePaths must never be
    // read as "nothing" - the single worst misread this formatter guards.
    const block = decided({
      platform: 'ios',
      full: true,
      capturedStoryFilePaths: [],
      totalStoriesInBundle: 12,
      reason: 'main-branch',
    });

    const out = formatDiffScopeBlock(block, 'captured').join('\n');

    expect(out).toContain('🍎 iOS - captured EVERY story in this bundle');
    expect(out).toContain('Reason: main-branch');
    // None of the "nothing" / partial renderings may leak.
    expect(out).not.toContain('nothing');
    expect(out).not.toContain('captured 0');
    expect(out).not.toContain('Stories captured:');
    expect(out).not.toContain('Reused');
  });

  it('renders a PARTIAL zero-capture as "nothing captured" with the whole bundle reused', () => {
    const block = decided({
      platform: 'android',
      full: false,
      capturedStoryFilePaths: [],
      totalStoriesInBundle: 22,
      reason: 'captured 0 - no module changes reach any story',
    });

    const out = formatDiffScopeBlock(block, 'captured').join('\n');

    expect(out).toContain('🤖 Android - captured 0 of 22 stories in this bundle');
    expect(out).toContain(
      'Nothing your changes touch reaches a story, so all 22 were reused from the base build.'
    );
    expect(out).toContain('Reason: captured 0 - no module changes reach any story');
    // A partial-zero is NOT a full capture.
    expect(out).not.toContain('EVERY story');
    expect(out).not.toContain('Stories captured:');
  });

  it('degrades to a bare count (no "of M", no reused line) when the bundle has no manifest', () => {
    const block = decided({
      platform: 'ios',
      full: false,
      capturedStoryFilePaths: ['src/a/A.stories.tsx'],
      totalStoriesInBundle: undefined,
      reason: 'captured 1 - closure changed via src/a/a.ts',
    });

    const out = formatDiffScopeBlock(block, 'captured').join('\n');

    expect(out).toContain('🍎 iOS - captured 1 story');
    expect(out).not.toContain(' of ');
    expect(out).not.toContain('Reused');
    expect(out).toContain('• src/a/A.stories.tsx');
  });

  it('omits the reason line entirely when no reason is given (live ladder rung 3)', () => {
    const block = decided({
      platform: 'ios',
      full: false,
      capturedStoryFilePaths: ['src/a/A.stories.tsx'],
      totalStoriesInBundle: 4,
      reason: undefined,
    });

    const out = formatDiffScopeBlock(block, 'captured').join('\n');

    expect(out).toContain('captured 1 of 4 stories in this bundle');
    expect(out).not.toContain('Reason:');
  });

  it('bounds the story list and summarises the remainder', () => {
    const paths = Array.from({ length: 25 }, (_, i) => `src/s${i}/S${i}.stories.tsx`);
    const block = decided({
      platform: 'ios',
      full: false,
      capturedStoryFilePaths: paths,
      totalStoriesInBundle: 30,
      reason: 'captured 25 - many changed',
    });

    const out = formatDiffScopeBlock(block, 'captured').join('\n');

    expect(out).toContain('• src/s0/S0.stories.tsx');
    expect(out).toContain('• src/s19/S19.stories.tsx');
    // Path 20 (the 21st) is past the cap of 20.
    expect(out).not.toContain('• src/s20/S20.stories.tsx');
    expect(out).toContain('• ... and 5 more');
  });
});

// ---------------------------------------------------------------------------
// Tense parity - live and dry-run read identically apart from tense
// ---------------------------------------------------------------------------

describe('tense parity (Deliverable 5.5)', () => {
  /** Rewrite a would-capture block into its captured form using ONLY tense words. */
  function normaliseTense(wouldLines: string[]): string[] {
    return wouldLines.map((line) =>
      line
        .replace('would capture', 'captured')
        .replace('Would reuse', 'Reused')
        .replace('would be reused', 'were reused')
        .replace('Stories to capture:', 'Stories captured:')
    );
  }

  const cases: Array<[string, DecidedBlock]> = [
    [
      'partial with captures',
      decided({
        full: false,
        capturedStoryFilePaths: ['src/a/A.stories.tsx', 'src/b/B.stories.tsx'],
        totalStoriesInBundle: 22,
        reason: 'captured 2 - closure changed via src/a/a.ts',
      }),
    ],
    [
      'partial zero',
      decided({
        full: false,
        capturedStoryFilePaths: [],
        totalStoriesInBundle: 22,
        reason: 'captured 0',
      }),
    ],
    ['full capture', decided({ full: true, capturedStoryFilePaths: [], reason: 'main-branch' })],
    [
      'no-manifest degrade',
      decided({
        full: false,
        capturedStoryFilePaths: ['src/a/A.stories.tsx'],
        reason: 'captured 1',
      }),
    ],
  ];

  it.each(cases)('%s reads identically once tense is normalised', (_name, block) => {
    const would = formatDiffScopeBlock(block, 'would-capture');
    const captured = formatDiffScopeBlock(block, 'captured');

    // The ONLY difference between the two tenses is the tense words themselves.
    expect(normaliseTense(would)).toEqual(captured);
    // Sanity: the tense genuinely changed the raw text (nothing is a no-op).
    expect(would.join('\n')).not.toEqual(captured.join('\n'));
  });
});

// ---------------------------------------------------------------------------
// formatDiffScopeReport - headers, footer, mode -> tense
// ---------------------------------------------------------------------------

describe('formatDiffScopeReport', () => {
  const partial: DiffScopePlatformReport = decided({
    platform: 'ios',
    full: false,
    capturedStoryFilePaths: ['src/a/A.stories.tsx'],
    totalStoriesInBundle: 4,
    reason: 'captured 1 - closure changed via src/a/a.ts',
  });

  it('dry-run mode uses the preview header/footer and the "would capture" tense', () => {
    const out = formatDiffScopeReport('dry-run', [partial]);

    expect(out).toContain('📋 Diff Scope preview - dry run (no build created)');
    expect(out).toContain('iOS - would capture 1 of 4 stories in this bundle');
    expect(out).toContain('This is a preview: no build was created and nothing was uploaded.');
  });

  it('live mode uses the live header (no preview footer) and the "captured" tense', () => {
    const out = formatDiffScopeReport('live', [partial]);

    expect(out).toContain('📋 Diff Scope - what this run photographed');
    expect(out).toContain('iOS - captured 1 of 4 stories in this bundle');
    expect(out).not.toContain('This is a preview');
  });

  it('renders a mix of one full and one partial platform', () => {
    const out = formatDiffScopeReport('live', [
      decided({
        platform: 'ios',
        full: true,
        capturedStoryFilePaths: [],
        reason: 'native-changed',
      }),
      decided({
        platform: 'android',
        full: false,
        capturedStoryFilePaths: ['src/x/X.stories.tsx'],
        totalStoriesInBundle: 8,
        reason: 'captured 1 - closure changed via src/x.tsx',
      }),
    ]);

    expect(out).toContain('🍎 iOS - captured EVERY story in this bundle');
    expect(out).toContain('Reason: native-changed');
    expect(out).toContain('🤖 Android - captured 1 of 8 stories in this bundle');
    expect(out).toContain('• src/x/X.stories.tsx');
  });

  it('renders a dry-run bail-open as "a real run would capture EVERY story"', () => {
    const out = formatDiffScopeReport('dry-run', [
      { kind: 'bailed-open', platform: 'ios', reason: 'network exploded' },
    ]);

    expect(out).toContain('🍎 iOS - preview unavailable; a real run would capture EVERY story');
    expect(out).toContain('Reason: network exploded');
  });
});
