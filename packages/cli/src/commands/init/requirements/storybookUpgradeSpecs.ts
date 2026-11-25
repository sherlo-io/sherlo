/**
 * THE PACKAGES A STORYBOOK UPGRADE ADDS, in one `add` of the app's own package manager: every
 * @storybook/* package the app's package.json holds, plus `storybook` even when it is absent (Yarn 1
 * fails the upgrade without it), each at a range on the newest major. A range, not `latest`: Yarn 4
 * holds back a release for its first day, and the range lands on the newest one it allows.
 * `storybook upgrade` is not used, as it also adds @storybook/addon-mcp.
 *
 * Proven from 8.6.4 on npm, pnpm, Yarn 1, Yarn 4 and Bun, and from 10.6.1 on npm (spike
 * storybook-upgrade-steps): no file needs a change by hand afterwards.
 */
const STORYBOOK_UPGRADE_RANGE = '^10';

function storybookUpgradeSpecs(dependencyNames: string[]): string[] {
  const storybookPackages = dependencyNames.filter((name) => name.startsWith('@storybook/')).sort();

  return [...storybookPackages, 'storybook'].map((name) => `${name}@${STORYBOOK_UPGRADE_RANGE}`);
}

export default storybookUpgradeSpecs;
