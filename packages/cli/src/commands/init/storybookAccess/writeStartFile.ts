/**
 * STORYBOOK'S START FILE, MADE TO OPEN THE APP OUTSIDE STORYBOOK MODE. On Storybook's default setup
 * the start file (the `index` of the Storybook config folder) registers Storybook as the app's root,
 * and Sherlo's launch entry loads it in Storybook and testing mode. A scene launches in testing mode
 * but needs the app, so a start file that registers Storybook alone cannot launch a scene. Setup
 * puts its one registration under `isStorybookMode` and loads the app's entry otherwise.
 *
 * The file is found and read by the SDK's own rules (react-native-storybook
 * metro/detectStorybookSetup.js). Left as it is, with the reason answered: a start file that already
 * branches on Storybook mode, one that registers nothing yet (the next step prints the branched
 * registration, from the same text, ./startFileBranch), and one setup cannot rewrite.
 * Tested in ./__tests__/writeStartFile.
 */
import fs from 'fs';
import path from 'path';
import { detectEntryFile } from '../../test/detectBundler';
import { modeImportLine, startFileBranch } from './startFileBranch';

// What detectEntryFile answers when package.json names no main.
const DEFAULT_MAIN = 'index.js';

type StorybookSetupReader = {
  findStorybookEntry(projectRoot: string): string | null;
  detectStorybookSetup(source: string): 'default' | 'old';
  findRootRegistrations(source: string): {
    registrations: { start: number; end: number }[];
    usesImports: boolean;
  } | null;
};

/**
 * What setup did with the start file. `written` and `already`: the file branches on Storybook mode.
 * `unregistered`: it registers nothing yet, so the next step names the registration to add, branched,
 * requiring `appRequest`. `left`: setup cannot make it branch, for the reason named:
 *
 *     no-start-file         - the Storybook folder has no index file
 *     not-one-registration  - the file registers a root more than once, or inside other code
 *     no-app-entry          - package.json's "main" names no file and the app has no index file
 */
export type StartFileOutcome =
  | { written: string }
  | { already: string }
  | { unregistered: string; appRequest: string }
  | { left: 'no-start-file' | 'not-one-registration' | 'no-app-entry' };

/** Rewrite the start file to branch on Storybook mode, and answer what was done. */
function writeStartFile(projectRoot: string): StartFileOutcome {
  const reader = storybookSetupReader();
  const startFile = reader.findStorybookEntry(projectRoot);
  if (!startFile) return { left: 'no-start-file' };

  const source = fs.readFileSync(startFile, 'utf8');
  if (/\bisStorybookMode\b/.test(source)) return { already: startFile };

  const appRequest = appEntryRequest(projectRoot, startFile);
  if (reader.detectStorybookSetup(source) !== 'default') {
    return appRequest ? { unregistered: startFile, appRequest } : { left: 'no-app-entry' };
  }

  const found = reader.findRootRegistrations(source);
  // The registration is a statement of its own at the top of the file; anything else is the
  // person's own shape, which setup does not guess at.
  if (!found || found.registrations.length !== 1) return { left: 'not-one-registration' };
  if (!appRequest) return { left: 'no-app-entry' };
  const [registration] = found.registrations;

  fs.writeFileSync(
    startFile,
    `${modeImportLine(found.usesImports)}\n` +
      source.slice(0, registration.start) +
      startFileBranch(source.slice(registration.start, registration.end), appRequest).join('\n') +
      source.slice(registration.end)
  );
  return { written: startFile };
}

export default writeStartFile;

/** The SDK's reader of the Storybook start file: a plain script, loaded only when asked. */
function storybookSetupReader(): StorybookSetupReader {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../../../react-native-storybook/metro/detectStorybookSetup');
}

/**
 * What the start file requires to load the app, as a path from the start file's folder with no
 * extension: the file `main` of package.json names when it is a file of the project, else the
 * entry file the app has at its root (found by the SDK's `findAppEntry`). A `main` that names a
 * package's file (such as `expo-router/entry`) is required by that name. Null when the app has no
 * entry.
 */
function appEntryRequest(projectRoot: string, startFile: string): string | null {
  const main = detectEntryFile(projectRoot);
  const mainPath = path.join(fs.realpathSync(projectRoot), main);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sourceFiles = require('../../../../../react-native-storybook/metro/sourceFiles');
  const isProjectFile =
    sourceFiles.isExistingFile(mainPath) ||
    sourceFiles.firstExistingSourceFile(mainPath, 'javascript-first') !== null;
  const isPackageEntry = !isProjectFile && main !== DEFAULT_MAIN && !main.startsWith('.');
  if (isPackageEntry) return main;

  let entryPath = mainPath;
  if (!isProjectFile) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const launchTimeEntry = require('../../../../../react-native-storybook/metro/launchTimeEntry');
      entryPath = launchTimeEntry.findAppEntry(projectRoot);
    } catch {
      return null;
    }
  }

  // Found paths follow symlinks, so the start file's folder is resolved the same way.
  const withoutExtension = entryPath.replace(/\.[jt]sx?$/, '');
  const request = path
    .relative(fs.realpathSync(path.dirname(startFile)), withoutExtension)
    .split(path.sep)
    .join('/');
  return request.startsWith('.') ? request : `./${request}`;
}
