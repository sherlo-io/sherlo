/**
 * Tests for the shared capture-plan renderer (SHERLO-1919, in init's grammar since epic
 * sherlo-test-builds-apps).
 *
 * This is the ONE formatter both the live run and the --dry-run preview print
 * through, so the assertions here are the load-bearing ones:
 *   - the approved cases render VERBATIM, as one of init's step lines;
 *   - the inversion pin: a FULL capture with an EMPTY captured-file list renders
 *     as "all N stories", NEVER "nothing";
 *   - mode parity: the live and dry-run plans are byte-identical once the step's
 *     name is normalised - asserted DIRECTLY against the formatter;
 *   - the "N of M stories" fraction is manifest-denominated;
 *   - the no-manifest degrade drops "of M";
 *   - one line for the test when every platform decided the same, one per platform when not.
 *
 * chalk is forced off so the assertions compare against the exact plain text the
 * e2e suite (which also runs chalk-disabled) parses.
 */
import chalk from 'chalk';
chalk.level = 0;

import { describe, expect, it } from 'vitest';
import {
  describeDecision,
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

describe('approved output (verbatim)', () => {
  it('a partial capture names its stories under the step line', () => {
    const out = formatDiffScopeReport('live', [
      decided({
        platform: 'android',
        capturedStoryFilePaths: [
          'src/components/Storefront/PriceTag.stories.tsx',
          'src/components/Storefront/SharedButton.stories.tsx',
        ],
        totalStoriesInBundle: 22,
        reason: 'SharedButton.tsx changed',
      }),
    ]);

    expect(out).toBe(
      [
        '✔ Planned the capture    2 of 22 stories: SharedButton.tsx changed',
        '   Storefront/PriceTag',
        '   Storefront/SharedButton',
      ].join('\n')
    );
  });

  it.each([
    ['3-file tier', '3 files changed - SharedButton.tsx, theme.ts, Hello.stories.tsx'],
    ['many-file tier', '14 files changed'],
  ])('the server reason is passed through verbatim (%s)', (_name, reason) => {
    const out = formatDiffScopeReport('live', [
      decided({
        capturedStoryFilePaths: ['src/components/Storefront/ProductCard.stories.tsx'],
        totalStoriesInBundle: 22,
        reason,
      }),
    ]);

    expect(out.split('\n')[0]).toBe(`✔ Planned the capture    1 of 22 stories: ${reason}`);
  });

  it('a full capture says all of them, with the reason', () => {
    expect(
      formatDiffScopeReport('live', [
        decided({ full: true, totalStoriesInBundle: 2, reason: 'no main branch is set, so every test captures every story' }),
      ])
    ).toBe('✔ Planned the capture    2 of 2 stories: no main branch is set, so every test captures every story');
  });

  it('a full capture with no reason says it could not work out what changed', () => {
    expect(describeDecision(decided({ full: true, totalStoriesInBundle: 1 }))).toBe(
      "1 of 1 story: couldn't work out what changed, so all are captured to be safe"
    );
  });

  it('a partial capture of nothing says there is nothing to capture', () => {
    // The step's name already says "capture", so the server's reason stands alone.
    expect(
      describeDecision(decided({ totalStoriesInBundle: 24, reason: 'no change on this branch reaches any story' }))
    ).toBe('no change on this branch reaches any story');
    expect(describeDecision(decided({ totalStoriesInBundle: 24 }))).toBe('nothing to capture');
  });
});

describe('the inversion pin', () => {
  it('a FULL capture with an EMPTY captured-file list reads as all of them, never as nothing', () => {
    const decision = describeDecision(decided({ full: true, capturedStoryFilePaths: [], totalStoriesInBundle: 5 }));

    expect(decision).toMatch(/^5 of 5 stories/);
    expect(decision).not.toContain('nothing');
  });
});

describe('the fraction', () => {
  it('is denominated by the whole bundle', () => {
    expect(
      describeDecision(decided({ capturedStoryFilePaths: ['a/B.stories.tsx'], totalStoriesInBundle: 40 }))
    ).toBe('1 of 40 stories');
  });

  it('degrades to a bare count with no manifest', () => {
    expect(
      describeDecision(decided({ capturedStoryFilePaths: ['a/B.stories.tsx', 'a/C.stories.tsx'] }))
    ).toBe('2 stories');
  });
});

describe('a plan for two platforms is one line when they agree and one each when they differ', () => {
  it('one line for the test when every platform decided the same', () => {
    const same = { full: true, totalStoriesInBundle: 3, reason: 'first test' };

    expect(
      formatDiffScopeReport('live', [decided({ platform: 'android', ...same }), decided({ platform: 'ios', ...same })])
    ).toBe('✔ Planned the capture    3 of 3 stories: first test');
  });

  it('one line per platform, each naming it, when they differ', () => {
    expect(
      formatDiffScopeReport('live', [
        decided({ platform: 'android', full: true, totalStoriesInBundle: 3, reason: 'first test' }),
        decided({ platform: 'ios', totalStoriesInBundle: 3 }),
      ])
    ).toBe(
      [
        '✔ Planned the capture    🤖 Android - 3 of 3 stories: first test',
        '✔ Planned the capture    🍎 iOS - nothing to capture',
      ].join('\n')
    );
  });
});

describe('mode parity', () => {
  it('the dry run differs from the live run in the step name only', () => {
    const block = decided({
      capturedStoryFilePaths: ['src/components/Storefront/ProductCard.stories.tsx'],
      totalStoriesInBundle: 22,
      reason: 'ProductCard.tsx changed',
    });

    const live = formatDiffScopeReport('live', [block]);
    const dryRun = formatDiffScopeReport('dry-run', [block]);

    expect(dryRun.replace('Previewed the capture  ', 'Planned the capture    ')).toBe(live);
  });
});
