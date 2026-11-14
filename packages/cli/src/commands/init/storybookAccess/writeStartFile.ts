/**
 * STORYBOOK'S START FILE, MADE TO OPEN THE APP OUTSIDE STORYBOOK MODE. On Storybook's default setup
 * the start file (the `index` of the Storybook config folder) registers Storybook as the app's root,
 * and Sherlo's launch entry loads it in Storybook and testing mode. A scene launches in testing mode
 * but needs the app, so a start file that registers Storybook alone cannot launch a scene. Setup
 * puts its one registration under `isStorybookMode` and loads the app's entry otherwise.
 *
 * The file is found and read by the SDK's own rules (react-native-storybook
 * metro/detectStorybookSetup.js). Left as it is: a start file that already branches on Storybook
 * mode, and one on the old setup, which only exports Storybook for the app's own root to render.
 * Tested in ./__tests__/writeStartFile.
 */
import fs from 'fs';
import path from 'path';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';
import { detectEntryFile } from '../../test/detectBundler';

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

/** The SDK's reader of the Storybook start file: a plain script, loaded only when asked. */
function storybookSetupReader(): StorybookSetupReader {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../../../react-native-storybook/metro/detectStorybookSetup');
}

/**
 * Rewrite the start file to branch on Storybook mode. Answers the file rewritten, or null when it
 * was left as it is.
 */
function writeStartFile(projectRoot: string): string | null {
  const reader = storybookSetupReader();
  const startFile = reader.findStorybookEntry(projectRoot);
  if (!startFile) return null;

  const source = fs.readFileSync(startFile, 'utf8');
  if (/\bisStorybookMode\b/.test(source)) return null;
  if (reader.detectStorybookSetup(source) !== 'default') return null;

  const found = reader.findRootRegistrations(source);
  // The registration is a statement of its own at the top of the file; anything else is the
  // person's own shape, which setup does not guess at.
  if (!found || found.registrations.length !== 1) return null;
  const [registration] = found.registrations;

  const modeImport = found.usesImports
    ? `import { isStorybookMode } from '${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}';\n`
    : `const { isStorybookMode } = require('${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}');\n`;
  const appRequest = appEntryRequest(projectRoot, startFile);
  if (!appRequest) return null;

  const branch = [
    '// Storybook in Storybook mode; the app otherwise, as a scene launch needs it.',
    'if (isStorybookMode) {',
    `  ${source.slice(registration.start, registration.end)}`,
    '} else {',
    `  require('${appRequest}');`,
    '}',
  ].join('\n');

  fs.writeFileSync(
    startFile,
    modeImport + source.slice(0, registration.start) + branch + source.slice(registration.end)
  );
  return startFile;
}

export default writeStartFile;

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
      console.log(
        'Sherlo found no app entry to load outside Storybook mode: no "main" in package.json and no index file at the project root'
      );
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
