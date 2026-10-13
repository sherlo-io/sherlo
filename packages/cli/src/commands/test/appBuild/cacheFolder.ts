/**
 * WHERE SHERLO KEEPS FILES - the one home of every cache path the tool spells (operator rulings
 * 2026-10-13 Q16 A and Q17 A; sherlo book `building/build-cache.md`).
 *
 *   - SHERLO'S CACHE FOLDER, the machine's: `SHERLO_CACHE_DIR` when it is set, else the computer's
 *     own cache folder - `~/Library/Caches/sherlo` on a Mac, `$XDG_CACHE_HOME/sherlo` else
 *     `~/.cache/sherlo` elsewhere. Its `build-cache/` is the local build cache, shared by every
 *     project and checkout on the machine. Nothing else lives there: Xcode's and Gradle's compile
 *     caches stay in the tools' own folders.
 *   - THE PROJECT'S `.sherlo/` FOLDER: `data.json`, the build logs and the bundle cache. It ignores
 *     itself - the first write lays a `.gitignore` that keeps only itself and `data.json` (the file
 *     EAS mode uploads) - so nobody adds it to their own `.gitignore`.
 */
import fs from 'fs';
import path from 'path';
import { SHERLO_TEMP_DATA_FILENAME, SHERLO_TEMP_DIRECTORY } from '../../../constants';
import { appBuilder } from '../../../seams/appBuilder';
import { projectFiles } from '../../../seams/projectFiles';

/** The setting that names Sherlo's cache folder in place of the computer's. */
export const CACHE_DIR_ENV_VAR = 'SHERLO_CACHE_DIR';

/** The local build cache, inside Sherlo's cache folder. */
const LOCAL_BUILD_CACHE = 'build-cache';

/** What the project's `.sherlo/.gitignore` says: ignore everything but itself and `data.json`. */
const SHERLO_FOLDER_GITIGNORE = `*\n!.gitignore\n!${SHERLO_TEMP_DATA_FILENAME}\n`;

/**
 * Sherlo's cache folder on this machine. A relative `SHERLO_CACHE_DIR` is read from the folder the
 * command runs in, as every relative path the tool is given is.
 */
export function sherloCacheFolder(): string {
  const named = process.env[CACHE_DIR_ENV_VAR];
  if (named) return path.resolve(projectFiles().root(), named);

  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  const isMac = appBuilder().hostSystem() === 'macos';
  if (!isMac && xdgCacheHome) return path.join(xdgCacheHome, 'sherlo');

  // The home folder is read from the environment, never asked of the system, so a posed run sees
  // the pose's settings and not this machine's (sherlo / The seams, "Every door is a seam").
  // A machine with no home folder keeps the cache in the project's own `.sherlo/`, which ignores
  // itself.
  const home = process.env.HOME;
  if (!home) return path.join(projectFiles().root(), SHERLO_TEMP_DIRECTORY);

  return isMac
    ? path.join(home, 'Library', 'Caches', 'sherlo')
    : path.join(home, '.cache', 'sherlo');
}

/** The local build cache: the folder `--build-cache` names, else `build-cache` in Sherlo's cache folder. */
export function localBuildCacheFolder(buildCacheFlag: string | undefined): string {
  if (buildCacheFlag) return path.resolve(projectFiles().root(), buildCacheFlag);

  return path.join(sherloCacheFolder(), LOCAL_BUILD_CACHE);
}

/**
 * The project's `.sherlo/` folder, made when it is missing, with its `.gitignore` laid when that
 * is missing - the one writer every file the tool keeps in the project goes through. A
 * `.gitignore` that is there is the developer's, and is never written over.
 */
export function makeProjectSherloFolder(projectRoot: string): string {
  const sherloFolder = path.join(projectRoot, SHERLO_TEMP_DIRECTORY);
  fs.mkdirSync(sherloFolder, { recursive: true });

  const gitignorePath = path.join(sherloFolder, '.gitignore');
  if (!fs.existsSync(gitignorePath)) fs.writeFileSync(gitignorePath, SHERLO_FOLDER_GITIGNORE);

  return sherloFolder;
}
