/**
 * WHERE THE APP'S ROOT COMPONENT IS, so the in-app way of the next steps names the file the app has
 * and the import path to the Storybook folder is true from it.
 *
 * An expo-router app's root component is the `_layout` file of the router's folder. The folder is
 * found the way the Expo CLI finds it (@expo/cli build/src/start/server/metro/router.js,
 * getRouterDirectoryModuleIdWithManifest): the `root` the app config gives expo-router (its plugin
 * option, which expo-router's withRouter copies into `extra.router`), else `src/app` when it exists,
 * else `app`. An app without expo-router keeps it in `App` at its root or under `src/`.
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import { readProjectJson } from '../../../helpers/projectJson';
import type { RootComponentFile } from '../../../render/initSteps';

/** In the order tried: the first is the most common, named when none exists. */
const SCRIPT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

/**
 * The router's folder as app.json gives it, else the Expo CLI's default.
 * BUILD DEBT (init-for-agents): an app.config.js or app.config.ts is not run, so a `root` set only
 * there is not seen and the default is used.
 */
function expoRouterFolder(projectRoot: string): string {
  const expoConfig = readProjectJson(projectRoot, 'app.json')?.expo;
  const pluginOptions = (expoConfig?.plugins ?? []).find(
    (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-router'
  )?.[1];
  const configuredRoot: unknown = pluginOptions?.root ?? expoConfig?.extra?.router?.root;
  if (typeof configuredRoot === 'string') return path.posix.normalize(configuredRoot);

  return fs.existsSync(path.join(projectRoot, 'src', 'app')) ? 'src/app' : 'app';
}

function rootComponentFile(hasExpoRouter: boolean): RootComponentFile {
  const projectRoot = getCwd();
  const baseNames = hasExpoRouter
    ? [`${expoRouterFolder(projectRoot)}/_layout`]
    : ['App', 'src/App'];
  const candidates = baseNames.flatMap((baseName) =>
    SCRIPT_EXTENSIONS.map((extension) => `${baseName}${extension}`)
  );
  const foundFile = candidates.find((file) => fs.existsSync(path.join(projectRoot, file)));

  return foundFile ? { file: foundFile, found: true } : { file: candidates[0], found: false };
}

export default rootComponentFile;
