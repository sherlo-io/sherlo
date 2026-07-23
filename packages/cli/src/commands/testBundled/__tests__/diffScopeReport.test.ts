/**
 * Tests for the shared "Capture plan" renderer (SHERLO-1919).
 *
 * This is the ONE formatter both the live run and the --dry-run preview print
 * through, so the assertions here are the load-bearing ones:
 *   - every approved output case (1, 2, 2b tiers, 3, 4, 5, 7) renders VERBATIM;
 *   - the inversion pin: a FULL capture with an EMPTY captured-file list renders
 *     as "all N stories", NEVER "nothing";
 *   - tense parity: the live and dry-run blocks are byte-identical once the
 *     capture verb is normalised - asserted DIRECTLY against the formatter;
 *   - the "N of M stories" fraction is manifest-denominated;
 *   - the no-manifest degrade drops "of M" and the reuse clause.
 *
 * chalk is forced off so the assertions compare against the exact plain text the
 * e2e suite (which also runs chalk-disabled) parses.
 */
import chalk from 'chalk';
chalk.level = 0;

import { describe, expect, it } from 'vitest';
import {
  formatDiffScopeBlock,
  formatDiffScopeReport,
  type DiffScopePlatformReport,
} from '../diffScopeReport';

function decided(overrides: Partial<DiffScopePlatformReport> = {}): DiffScopePlatformReport {
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
// The approved output cases, rendered VERBATIM (SHERLO-1919 spec)
// ---------------------------------------------------------------------------

describe('approved output (verbatim)', () => {
  it('Case 1: partial capture - one story', () => {
    const out = formatDiffScopeReport('live', [
      decided({
        platform: 'android',
        full: false,
        capturedStoryFilePaths: ['src/components/Sanity/Hello.stories.tsx'],
        totalStoriesInBundle: 22,
        reason: 'Sanity/Hello.stories.tsx changed',
      }),
    ]);

    expect(out).toBe(
      [
        '📸 Capture plan',
        '  🤖 Android - capturing 1 of 22 stories, reusing 21 from the previous build',
        '     why: Sanity/Hello.stories.tsx changed',
        '     stories:',
        '       • Sanity/Hello',
      ].join('\n')
    );
  });

  it('Case 2: shared file, several stories', () => {
    const out = formatDiffScopeReport('live', [
      decided({
        platform: 'android',
        full: false,
        capturedStoryFilePaths: [
          'src/components/Storefront/CheckoutScreen.stories.tsx',
          'src/components/Storefront/PriceTag.stories.tsx',
          'src/components/Storefront/PriceTagInline.stories.tsx',
          'src/components/Storefront/ProductCard.stories.tsx',
          'src/components/Storefront/ProductCardCompact.stories.tsx',
          'src/components/Storefront/SharedButton.stories.tsx',
        ],
        totalStoriesInBundle: 22,
        reason: 'SharedButton.tsx changed',
      }),
    ]);

    expect(out).toBe(
      [
        '📸 Capture plan',
        '  🤖 Android - capturing 6 of 22 stories, reusing 16 from the previous build',
        '     why: SharedButton.tsx changed',
        '     stories:',
        '       • Storefront/CheckoutScreen',
        '       • Storefront/PriceTag',
        '       • Storefront/PriceTagInline',
        '       • Storefront/ProductCard',
        '       • Storefront/ProductCardCompact',
        '       • Storefront/SharedButton',
      ].join('\n')
    );
  });

  // Case 2b: the why-line is SERVER-composed and printed VERBATIM after "why: ".
  // The CLI does not compose the tier wording - it passes whatever it is given
  // straight through, so both tiers below are a pure pass-through assertion.
  it.each([
    ['3-file tier', '3 files changed - SharedButton.tsx, theme.ts, Hello.stories.tsx'],
    ['many-file tier', '14 files changed'],
  ])('Case 2b: the why-line is passed through verbatim (%s)', (_name, reason) => {
    const out = formatDiffScopeReport('live', [
      decided({
        platform: 'android',
        full: false,
        capturedStoryFilePaths: ['src/components/Storefront/ProductCard.stories.tsx'],
        totalStoriesInBundle: 22,
        reason,
      }),
    ]);

    expect(out).toContain(`     why: ${reason}`);
  });

  it('Case 3: nothing to capture', () => {
    const out = formatDiffScopeReport('live', [
      decided({
        platform: 'android',
        full: false,
        capturedStoryFilePaths: [],
        totalStoriesInBundle: 22,
        reason: 'no change reaches any story',
      }),
    ]);

    expect(out).toBe(
      [
        '📸 Capture plan',
        '  🤖 Android - nothing to capture - no change reaches any story',
        '     ✓ all 22 stories reused from the previous build',
      ].join('\n')
    );
  });

  it('Case 4: full capture, both platforms', () => {
    const out = formatDiffScopeReport('live', [
      decided({
        platform: 'android',
        full: true,
        capturedStoryFilePaths: [],
        totalStoriesInBundle: 22,
        reason: 'first build - nothing to compare against yet',
      }),
      decided({
        platform: 'ios',
        full: true,
        capturedStoryFilePaths: [],
        totalStoriesInBundle: 22,
        reason: 'native code changed - everything re-shot',
      }),
    ]);

    expect(out).toBe(
      [
        '📸 Capture plan',
        '  🤖 Android - capturing all 22 stories',
        '     why: first build - nothing to compare against yet',
        '  🍎 iOS - capturing all 22 stories',
        '     why: native code changed - everything re-shot',
      ].join('\n')
    );
  });

  it('Case 5: platforms disagree (one partial, one nothing)', () => {
    const out = formatDiffScopeReport('live', [
      decided({
        platform: 'ios',
        full: false,
        capturedStoryFilePaths: ['src/components/Storefront/ProductCard.stories.tsx'],
        totalStoriesInBundle: 22,
        reason: 'ProductCardPlatformNote.ios.tsx changed',
      }),
      decided({
        platform: 'android',
        full: false,
        capturedStoryFilePaths: [],
        totalStoriesInBundle: 22,
        reason: 'the change never reaches the Android app',
      }),
    ]);

    expect(out).toBe(
      [
        '📸 Capture plan',
        '  🍎 iOS - capturing 1 of 22 stories, reusing 21 from the previous build',
        '     why: ProductCardPlatformNote.ios.tsx changed',
        '     stories:',
        '       • Storefront/ProductCard',
        '  🤖 Android - nothing to capture - the change never reaches the Android app',
        '     ✓ all 22 stories reused from the previous build',
      ].join('\n')
    );
  });

  it('Case 7: decision unavailable - full capture with no reason (degraded / older server)', () => {
    const out = formatDiffScopeReport('live', [
      decided({
        platform: 'android',
        full: true,
        capturedStoryFilePaths: [],
        totalStoriesInBundle: 22,
        reason: undefined,
      }),
    ]);

    expect(out).toBe(
      [
        '📸 Capture plan',
        '  🤖 Android - capturing all 22 stories',
        "     ! couldn't compute what changed - capturing everything to be safe",
      ].join('\n')
    );
  });

  it('the dry-run header appends " (dry run)"', () => {
    const out = formatDiffScopeReport('dry-run', [
      decided({ platform: 'android', full: true, totalStoriesInBundle: 3, reason: 'x' }),
    ]);
    expect(out.split('\n')[0]).toBe('📸 Capture plan (dry run)');
  });
});

// ---------------------------------------------------------------------------
// formatDiffScopeBlock - the shared per-platform core
// ---------------------------------------------------------------------------

describe('formatDiffScopeBlock', () => {
  it('THE INVERSION PIN: a FULL capture with an EMPTY list renders "all N stories", never "nothing"', () => {
    // full: true is "everything"; the empty capturedStoryFilePaths must never be
    // read as "nothing" - the single worst misread this formatter guards.
    const block = decided({
      platform: 'ios',
      full: true,
      capturedStoryFilePaths: [],
      totalStoriesInBundle: 12,
      reason: 'main-branch',
    });

    const out = formatDiffScopeBlock(block, 'capturing').join('\n');

    expect(out).toBe(['  🍎 iOS - capturing all 12 stories', '     why: main-branch'].join('\n'));
    // None of the "nothing" / partial renderings may leak.
    expect(out).not.toContain('nothing');
    expect(out).not.toContain('capturing 0');
    expect(out).not.toContain('stories:');
    expect(out).not.toContain('reusing');
  });

  it('renders a PARTIAL zero-capture as "nothing to capture" with the whole bundle reused', () => {
    const block = decided({
      platform: 'android',
      full: false,
      capturedStoryFilePaths: [],
      totalStoriesInBundle: 22,
      reason: 'no change reaches any story',
    });

    const out = formatDiffScopeBlock(block, 'capturing').join('\n');

    expect(out).toBe(
      [
        '  🤖 Android - nothing to capture - no change reaches any story',
        '     ✓ all 22 stories reused from the previous build',
      ].join('\n')
    );
    // A partial-zero is NOT a full capture and never lists stories.
    expect(out).not.toContain('capturing');
    expect(out).not.toContain('stories:');
  });

  it('degrades to a bare count (no "of M", no reuse clause) when the bundle has no manifest', () => {
    const block = decided({
      platform: 'ios',
      full: false,
      capturedStoryFilePaths: ['src/components/A/A.stories.tsx'],
      totalStoriesInBundle: undefined,
      reason: 'a.ts changed',
    });

    const out = formatDiffScopeBlock(block, 'capturing').join('\n');

    expect(out).toBe(
      [
        '  🍎 iOS - capturing 1 story',
        '     why: a.ts changed',
        '     stories:',
        '       • A/A',
      ].join('\n')
    );
    expect(out).not.toContain(' of ');
    expect(out).not.toContain('reusing');
  });

  it('SINGULAR at M === 1: a full capture reads "all 1 story", not "all 1 stories"', () => {
    const block = decided({
      platform: 'android',
      full: true,
      capturedStoryFilePaths: [],
      totalStoriesInBundle: 1,
      reason: 'first build - nothing to compare against yet',
    });

    const out = formatDiffScopeBlock(block, 'capturing').join('\n');

    expect(out).toBe(
      [
        '  🤖 Android - capturing all 1 story',
        '     why: first build - nothing to compare against yet',
      ].join('\n')
    );
    expect(out).not.toContain('all 1 stories');
  });

  it('SINGULAR at M === 1: a zero-capture reads "all 1 story reused", not "all 1 stories reused"', () => {
    const block = decided({
      platform: 'android',
      full: false,
      capturedStoryFilePaths: [],
      totalStoriesInBundle: 1,
      reason: 'no change reaches any story',
    });

    const out = formatDiffScopeBlock(block, 'capturing').join('\n');

    expect(out).toBe(
      [
        '  🤖 Android - nothing to capture - no change reaches any story',
        '     ✓ all 1 story reused from the previous build',
      ].join('\n')
    );
    expect(out).not.toContain('all 1 stories');
  });

  it('drops the "reusing 0" clause when nothing is reused (partial 1 of 1)', () => {
    const block = decided({
      platform: 'android',
      full: false,
      capturedStoryFilePaths: ['src/components/Sanity/Hello.stories.tsx'],
      totalStoriesInBundle: 1,
      reason: 'Sanity/Hello.stories.tsx changed',
    });

    const out = formatDiffScopeBlock(block, 'capturing').join('\n');

    expect(out).toBe(
      [
        '  🤖 Android - capturing 1 of 1 stories',
        '     why: Sanity/Hello.stories.tsx changed',
        '     stories:',
        '       • Sanity/Hello',
      ].join('\n')
    );
    // The meaningless "nothing happened" clause must not appear.
    expect(out).not.toContain('reusing');
    expect(out).not.toContain('reusing 0');
  });

  it('a full capture with no manifest degrades to "all stories" (no number)', () => {
    const block = decided({
      platform: 'ios',
      full: true,
      capturedStoryFilePaths: [],
      totalStoriesInBundle: undefined,
      reason: 'native-changed',
    });

    const out = formatDiffScopeBlock(block, 'capturing').join('\n');

    expect(out).toBe(['  🍎 iOS - capturing all stories', '     why: native-changed'].join('\n'));
  });

  it('omits the why line entirely on a partial when no reason is given', () => {
    const block = decided({
      platform: 'ios',
      full: false,
      capturedStoryFilePaths: ['src/components/A/A.stories.tsx'],
      totalStoriesInBundle: 4,
      reason: undefined,
    });

    const out = formatDiffScopeBlock(block, 'capturing').join('\n');

    expect(out).toBe(
      [
        '  🍎 iOS - capturing 1 of 4 stories, reusing 3 from the previous build',
        '     stories:',
        '       • A/A',
      ].join('\n')
    );
    expect(out).not.toContain('why:');
  });

  it('lists the FULL story set with no "+N more" truncation (MAX_LISTED_STORIES deleted)', () => {
    const paths = Array.from({ length: 25 }, (_, i) => `src/components/g${i}/S${i}.stories.tsx`);
    const block = decided({
      platform: 'ios',
      full: false,
      capturedStoryFilePaths: paths,
      totalStoriesInBundle: 30,
      reason: 'many changed',
    });

    const out = formatDiffScopeBlock(block, 'capturing').join('\n');

    // Every path is listed - including the 21st and beyond, which the old
    // renderer would have summarised as "... and N more".
    expect(out).toContain('       • g0/S0');
    expect(out).toContain('       • g20/S20');
    expect(out).toContain('       • g24/S24');
    expect(out).not.toContain('more');
    // 25 bullets present.
    expect(out.split('\n').filter((l) => l.includes('• g')).length).toBe(25);
  });

  it('cleans story paths to "group/name", dropping the src/... prefix and .stories.<ext> suffix', () => {
    const block = decided({
      platform: 'ios',
      full: false,
      capturedStoryFilePaths: [
        'src/components/Storefront/ProductCard.stories.tsx',
        'src/features/checkout/components/Cart/Cart.stories.jsx',
        'packages/ui/src/Sanity/Hello.stories.ts',
      ],
      totalStoriesInBundle: 10,
      reason: 'x changed',
    });

    const out = formatDiffScopeBlock(block, 'capturing').join('\n');

    expect(out).toContain('       • Storefront/ProductCard');
    expect(out).toContain('       • Cart/Cart');
    expect(out).toContain('       • Sanity/Hello');
  });
});

// ---------------------------------------------------------------------------
// Tense parity - live and dry-run read identically apart from the capture verb
// ---------------------------------------------------------------------------

describe('tense parity', () => {
  /** Rewrite a would-capture block into its capturing form using ONLY the verb. */
  function normaliseVerb(wouldLines: string[]): string[] {
    return wouldLines.map((line) => line.replace('would capture', 'capturing'));
  }

  const cases: Array<[string, DiffScopePlatformReport]> = [
    [
      'partial with captures',
      decided({
        full: false,
        capturedStoryFilePaths: [
          'src/components/a/A.stories.tsx',
          'src/components/b/B.stories.tsx',
        ],
        totalStoriesInBundle: 22,
        reason: 'a.ts changed',
      }),
    ],
    [
      'partial zero',
      decided({
        full: false,
        capturedStoryFilePaths: [],
        totalStoriesInBundle: 22,
        reason: 'no change reaches any story',
      }),
    ],
    ['full capture', decided({ full: true, totalStoriesInBundle: 12, reason: 'main-branch' })],
    ['full capture, no reason', decided({ full: true, totalStoriesInBundle: 12 })],
    [
      'no-manifest degrade',
      decided({
        full: false,
        capturedStoryFilePaths: ['src/components/a/A.stories.tsx'],
        reason: 'x',
      }),
    ],
  ];

  it.each(cases)('%s reads identically once the verb is normalised', (_name, block) => {
    const would = formatDiffScopeBlock(block, 'would-capture');
    const capturing = formatDiffScopeBlock(block, 'capturing');

    // The ONLY difference between the two tenses is the capture verb.
    expect(normaliseVerb(would)).toEqual(capturing);
  });

  it('the capture verb genuinely changes a capturing block (nothing is a no-op)', () => {
    const block = decided({
      full: false,
      capturedStoryFilePaths: ['src/components/a/A.stories.tsx'],
      totalStoriesInBundle: 22,
      reason: 'a.ts changed',
    });
    expect(formatDiffScopeBlock(block, 'would-capture').join('\n')).not.toEqual(
      formatDiffScopeBlock(block, 'capturing').join('\n')
    );
  });

  // A partial-zero block has NO capture verb, so it is byte-identical in both
  // modes - the "reusing ... from the previous build" wording stays present tense.
  it('a partial-zero block is byte-identical across both modes', () => {
    const block = decided({
      full: false,
      capturedStoryFilePaths: [],
      totalStoriesInBundle: 22,
      reason: 'no change reaches any story',
    });
    expect(formatDiffScopeBlock(block, 'would-capture')).toEqual(
      formatDiffScopeBlock(block, 'capturing')
    );
  });
});
