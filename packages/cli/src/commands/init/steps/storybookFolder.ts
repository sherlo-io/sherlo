/**
 * WHERE THE APP'S STORYBOOK FOLDER IS, found the way Sherlo's Metro wrapper finds it
 * (packages/react-native-storybook/metro/ensureStorybookRequires.js, resolveConfigDir): the
 * `configPath` the Metro config gives withStorybook, else `.rnstorybook` (Storybook 9 and later),
 * else `.storybook` (Storybook 8, kept by an app upgraded from it). Setup's every look at the folder
 * - which setup the app uses, which stories are its own, the next steps' file names - asks here, so
 * none of them names a folder the app does not have.
 *
 * Proven by spike package-manager-edges: an app upgraded from 8 keeps `.storybook`, and a lookup of
 * `.rnstorybook` alone counted its examples as the app's stories and named a missing folder.
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import getMetroConfigPath from '../metroConfig/getMetroConfigPath';
import readMetroConfigCode from '../metroConfig/readMetroConfigCode';

/** Storybook's own default folders, newest first - the order the Metro wrapper tries them in. */
export const DEFAULT_STORYBOOK_FOLDERS = ['.rnstorybook', '.storybook'];

/**
 * The folder relative to the app's folder (`.storybook`), or null when the app has none.
 *
 * A `configPath` read from the Metro config's parsed code: a plain string is resolved against the
 * app's folder, as the wrapper's `path.resolve(projectRoot, configPath)` does; one built from
 * `__dirname` against the Metro config's own folder, which is not the app's when the config lives
 * in `.config/`. BUILD DEBT (init-for-agents): a configPath built any other way is not read, and
 * the defaults are tried as if none were given.
 */
function storybookFolder(): string | null {
  const metroConfigPath = getMetroConfigPath();
  const configPath = metroConfigPath
    ? readMetroConfigCode(fs.readFileSync(metroConfigPath, 'utf8'))?.configPath
    : null;
  if (metroConfigPath && configPath) {
    const base = configPath.against === 'config-folder' ? path.dirname(metroConfigPath) : getCwd();
    return path.relative(getCwd(), path.resolve(base, configPath.path)) || '.';
  }

  return DEFAULT_STORYBOOK_FOLDERS.find((name) => fs.existsSync(path.join(getCwd(), name))) ?? null;
}

export default storybookFolder;

/**
 * The order a file of Storybook's folder is looked for in, the SDK's own
 * (packages/react-native-storybook/metro/sourceFiles.js): `index.ts` before `index.tsx`.
 */
export const STORYBOOK_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * The folder's `index` or `main` file as the app has it (`.storybook/main.js`), so a next step names
 * the file the person opens, never a guess. With none there yet, the `.ts` Storybook's installer
 * writes.
 */
export function storybookFile(folder: string, baseName: 'index' | 'main'): string {
  const extension =
    STORYBOOK_SOURCE_EXTENSIONS.find((candidate) =>
      fs.existsSync(path.join(getCwd(), folder, baseName + candidate))
    ) ?? '.ts';
  return path.posix.join(folder, baseName + extension);
}
