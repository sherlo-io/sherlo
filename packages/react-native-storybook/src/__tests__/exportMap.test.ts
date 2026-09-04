/**
 * Pins package.json's `exports` map to an exact string list.
 *
 * Four things freeze this package permanently (design.md "The rule that
 * places every file"): frozen require specifiers, the native spec, the
 * polyfill's source text, and the pre-main native config read. A shim
 * emitted a year ago still says `@sherlo/react-native-storybook/mocking`;
 * renaming or removing any export subpath breaks every customer build that
 * already happened. The frozen surface must be decided deliberately, not by
 * whichever file happens to be renamed last (SDK inventory spike, "What I
 * would do next" §1) - this test is that deliberateness, enforced.
 *
 * The eight subpaths present before the lite-SDK split
 * (., ./metro/withStorybook, ./mocking, ./metro/polyfill,
 * ./dist/getStorybook/index.js, ./dist/addStorybookToDevMenu.js,
 * ./dist/SherloModule.js, ./package.json) plus four added by it: ./seam (the
 * public surface a spliced runtime reads), ./metro (a bare alias to
 * withStorybook, named by the CLI's own requirement-validator test), ./metro/entry
 * (the generated-entry generator buildBundle.ts calls), and ./constants (the
 * shim's frozen native library/symbol names, per the architect's backward-
 * compatibility ruling 2026-09-04).
 *
 * Adding a subpath here is a real decision - update this list deliberately,
 * in the same PR as the export, never as a side effect of an unrelated change.
 */
import packageJson from '../../package.json';

const FROZEN_EXPORT_SUBPATHS = [
  '.',
  './metro/withStorybook',
  './mocking',
  './metro/polyfill',
  './seam',
  './metro',
  './metro/entry',
  './constants',
  './dist/getStorybook/index.js',
  './dist/addStorybookToDevMenu.js',
  './dist/SherloModule.js',
  './package.json',
];

describe('package.json exports - frozen surface', () => {
  it('is exactly the frozen subpath list, in order', () => {
    expect(Object.keys(packageJson.exports)).toEqual(FROZEN_EXPORT_SUBPATHS);
  });

  it('has no duplicate subpaths', () => {
    const keys = Object.keys(packageJson.exports);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
