/**
 * THE METRO CONFIG METRO ITSELF LOADS, found by metro-config's own search (loadConfig.js,
 * searchForConfigFile): in the app's folder and then each folder above it, up to and including the
 * home folder, the first of `metro.config.<ext>` and `.config/metro.<ext>`, then a package.json
 * holding a "metro" key. Setup reads and wires that file, so it never writes a second config Metro
 * would not load, nor misses one Metro does.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getCwd } from '../../../helpers';

const EXTENSIONS = ['.js', '.cjs', '.mjs', '.json', '.ts', '.cts', '.mts'];
const SEARCH_PLACES = ['metro.config', path.join('.config', 'metro')].flatMap((prefix) =>
  EXTENSIONS.map((extension) => prefix + extension)
);

function getMetroConfigPath(): string | null {
  const homeFolder = os.homedir();
  let folder = path.resolve(getCwd());
  while (true) {
    for (const place of SEARCH_PLACES) {
      const candidate = path.join(folder, place);
      if (isFile(candidate)) return candidate;
    }
    const packageJson = path.join(folder, 'package.json');
    if (isFile(packageJson) && hasMetroKey(packageJson)) return packageJson;

    const parent = path.dirname(folder);
    if (folder === homeFolder || parent === folder) return null;
    folder = parent;
  }
}

export default getMetroConfigPath;

function isFile(file: string): boolean {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

function hasMetroKey(packageJson: string): boolean {
  try {
    const content: unknown = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    return (
      typeof content === 'object' &&
      content !== null &&
      Object.prototype.hasOwnProperty.call(content, 'metro')
    );
  } catch {
    return false;
  }
}
