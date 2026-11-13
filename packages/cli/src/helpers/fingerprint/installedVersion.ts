import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { readProjectJson } from '../projectJson';
import { digestDirectory } from './digestDirectory';

const SHERLO_SDK_PACKAGE = '@sherlo/react-native-storybook';

/** The Sherlo package's folders that hold native code; its podspec sits beside them. */
const SHERLO_NATIVE_FOLDERS = ['ios', 'android'];

/** A hash of the Sherlo package's native files (ios/, android/, the podspec), never its version. */
function sherloNativeFilesHash(packageFolder: string): string {
  const hash = crypto.createHash('sha256');
  for (const name of SHERLO_NATIVE_FOLDERS) {
    const folder = path.join(packageFolder, name);
    hash.update(`${name}:${fs.existsSync(folder) ? digestDirectory(folder) : 'missing'}\n`);
  }
  for (const name of fs.readdirSync(packageFolder).filter((file) => file.endsWith('.podspec'))) {
    hash.update(`${name}:${fs.readFileSync(path.join(packageFolder, name)).toString('hex')}\n`);
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * The version slot of a module's `name@version` entry: the version in its own package.json. For
 * the Sherlo package it is a hash of its native files, so an update that changed only JavaScript
 * leaves the entry as it was.
 */
export function installedVersionOf(name: string, packageFolder: string | null): string {
  if (!packageFolder) return 'unknown';
  if (name === SHERLO_SDK_PACKAGE) return sherloNativeFilesHash(packageFolder);
  const version: unknown = readProjectJson(packageFolder, 'package.json')?.version;
  return typeof version === 'string' ? version : 'unknown';
}
