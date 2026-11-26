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

/** Storybook's own default folders, newest first - the order the Metro wrapper tries them in. */
const DEFAULT_FOLDERS = ['.rnstorybook', '.storybook'];

/** Storybook 9's default, named when the app has no folder yet (Storybook's installer writes it). */
export const NEWEST_STORYBOOK_FOLDER = DEFAULT_FOLDERS[0];

/**
 * A `configPath` written as a plain string, or as `path.resolve(__dirname, '<string>')`.
 * BUILD DEBT (init-for-agents): a configPath built any other way is not read, and the defaults are
 * tried as if none were given.
 */
const CONFIG_PATH = /\bconfigPath\s*:\s*(?:path\.(?:resolve|join)\(\s*__dirname\s*,\s*)?['"]([^'"]+)['"]/;

/** The folder relative to the app's folder (`.storybook`), or null when the app has none. */
function storybookFolder(): string | null {
  const metroConfigPath = getMetroConfigPath();
  const configPath = metroConfigPath
    ? CONFIG_PATH.exec(fs.readFileSync(metroConfigPath, 'utf8'))?.[1]
    : undefined;
  if (configPath) return path.normalize(configPath);

  return DEFAULT_FOLDERS.find((name) => fs.existsSync(path.join(getCwd(), name))) ?? null;
}

export default storybookFolder;
