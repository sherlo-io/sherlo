import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { sha256OfBuffer } from '../sha256OfBuffer';
import { BUILD_WRITTEN_FOLDER_NAMES } from './writtenByABuild';

/**
 * Directory names skipped when digesting a native directory - build output and caches that
 * `@expo/fingerprint` skips too, plus `node_modules` (vouched for by the dependency closure) and
 * `.git`, plus the folders ./writtenByABuild names. A build machine has them, a checkout does
 * not, and neither is an input to the fingerprint.
 */
const SKIPPED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.git',
  'build',
  '.cxx',
  '.gradle',
  'Pods',
  'DerivedData',
  'xcuserdata',
  ...BUILD_WRITTEN_FOLDER_NAMES,
]);

const SKIPPED_FILE_NAMES = new Set(['.DS_Store']);

/** One digest over every file under `directory` (names and bytes), build output skipped. */
export function digestDirectory(directory: string): string {
  const hash = crypto.createHash('sha256');

  function walk(dir: string, relativeDir: string): void {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
          walk(path.join(dir, entry.name), relativePath);
        }
        continue;
      }
      if (!entry.isFile() || SKIPPED_FILE_NAMES.has(entry.name)) continue;
      hash.update(
        `${relativePath}:${sha256OfBuffer(fs.readFileSync(path.join(dir, entry.name)))}\n`
      );
    }
  }

  walk(directory, '');
  return hash.digest('hex');
}
