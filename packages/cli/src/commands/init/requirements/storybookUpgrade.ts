/**
 * THE STORYBOOK UPGRADE BOTH STORYBOOK REFUSALS END ON, as the commands a person or their agent
 * runs, in the app's own package manager, in the folder whose package.json holds Storybook - the
 * app's, or the workspace root's when the packages sit there.
 *
 * ONE `add` IS NOT ENOUGH FROM STORYBOOK 8: packages that ended at 8 (addon-essentials and the web
 * addons around it) have no 10.x release, so pnpm finds no version and npm stops on their 8.x peers.
 * So the upgrade is two commands:
 *   1. remove every Storybook package the folder holds that has no 10.x release, plus `storybook`;
 *   2. add every @storybook/* package it holds that has a 10.x release, plus `storybook` even when
 *      it is absent (Yarn 1 fails the upgrade without it), each at a range on the newest major.
 * A package on its own version line (addon-react-native-web, at 0.0.x) is left alone. With nothing
 * to remove, the upgrade is the add alone.
 *
 * A range, not `latest`: Yarn 4 holds back a release for its first day, and the range lands on the
 * newest one it allows. `storybook upgrade` is not used, as it also adds @storybook/addon-mcp.
 *
 * Proven on the tester's Storybook 8.6.4 base with the web addons, on npm, pnpm 12, Yarn 1, Yarn 4
 * and Bun, by install plus an Android Storybook export (spike package-manager-edges); and from
 * 10.6.1 on npm (spike storybook-upgrade-steps).
 */
import { detect } from 'package-manager-detector';
import { dirname, relative } from 'path';
import { STORYBOOK_REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { getCwd } from '../../../helpers';
import type { StorybookUpgrade } from '../../../render/initFixes';
import { managerCommand } from '../dependencies/installSherlo';
import findPackageJsonPaths from './findPackageJsonPaths';
import hasDependency, { readAllDependencies } from './hasDependency';

const STORYBOOK_UPGRADE_RANGE = '^10';

/**
 * The @storybook packages that have a 10.x release. Held here, not asked of the registry, so a
 * refusal needs no network. Read with `npm view <package> dist-tags.latest` on 2026-11-26 (spike
 * package-manager-edges): addon-essentials, addon-actions, addon-controls, addon-interactions and
 * blocks stopped at 8.6.
 */
const RELEASED_AT_10 = new Set([
  '@storybook/addon-a11y',
  '@storybook/addon-docs',
  '@storybook/addon-links',
  '@storybook/addon-ondevice-actions',
  '@storybook/addon-ondevice-backgrounds',
  '@storybook/addon-ondevice-controls',
  '@storybook/addon-ondevice-notes',
  '@storybook/addon-onboarding',
  '@storybook/addon-themes',
  '@storybook/addon-vitest',
  '@storybook/builder-vite',
  '@storybook/builder-webpack5',
  '@storybook/react',
  '@storybook/react-dom-shim',
  '@storybook/react-native',
  '@storybook/react-native-theming',
  '@storybook/react-native-ui',
  '@storybook/react-native-ui-common',
  '@storybook/react-native-ui-lite',
  '@storybook/react-native-web-vite',
  '@storybook/react-vite',
  '@storybook/react-webpack5',
]);

/** Storybook packages versioned on their own line, not Storybook's: the upgrade leaves them alone. */
const OWN_VERSION_LINE = new Set(['@storybook/addon-react-native-web']);

/** pnpm 12 runs no package's build script unless told; Storybook 10's esbuild needs its own. */
const PNPM_ALLOW_ESBUILD = '--allow-build=esbuild';

async function storybookUpgrade(): Promise<StorybookUpgrade> {
  const { current, monorepoRoot } = await findPackageJsonPaths();
  const holder = (await hasDependency(current, STORYBOOK_REACT_NATIVE_PACKAGE_NAME))
    ? current
    : (monorepoRoot ?? current);
  const holderFolder = holder ? dirname(holder) : getCwd();

  const tool = (await detect({ cwd: holderFolder }))?.agent ?? 'npm';
  const dependencyNames = Object.keys(holder ? await readAllDependencies(holder) : {});
  const storybookPackages = dependencyNames.filter((name) => name.startsWith('@storybook/')).sort();

  const ended = storybookPackages.filter(
    (name) => !RELEASED_AT_10.has(name) && !OWN_VERSION_LINE.has(name)
  );
  const added = [...storybookPackages.filter((name) => RELEASED_AT_10.has(name)), 'storybook'].map(
    (name) => `${name}@${STORYBOOK_UPGRADE_RANGE}`
  );

  // `storybook` goes only when held: Yarn refuses to remove a package the folder does not list.
  const removed = [...ended, ...(dependencyNames.includes('storybook') ? ['storybook'] : [])];
  const add = managerCommand(tool, 'add', added) + (tool === 'pnpm' ? ` ${PNPM_ALLOW_ESBUILD}` : '');

  return {
    commands: ended.length > 0 ? [managerCommand(tool, 'uninstall', removed), add] : [add],
    folder: relative(getCwd(), holderFolder) || null,
  };
}

export default storybookUpgrade;
