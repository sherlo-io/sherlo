/**
 * WHICH OF STORYBOOK'S SETUPS THE APP USES, which decides the Storybook access next step.
 *
 * Storybook 10.4+ makes its folder's index (`.rnstorybook/index`, or wherever ./storybookFolder finds
 * the folder) register the app's root itself, and Sherlo's Metro wrapper then swaps the entry at launch: nothing in the app needs changing - Storybook's default
 * setup. The old setup renders Storybook from the app's own root component. When the app's code
 * already asks Sherlo's `isStorybookMode` (the next steps' way b), Sherlo opens Storybook there
 * too, so a rerun after way b) has nothing left to set up. No version is read.
 *
 * THE OLD SETUP IS SEEN, NEVER ASSUMED: it is an app file outside the Storybook folder that imports
 * the folder. With none, nothing in the app starts Storybook yet, so there is no code to remove
 * (`not-started`) - an app made from a template that never wired Storybook in, for one.
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import someAppFile from './someAppFile';
import storybookFolder, { STORYBOOK_SOURCE_EXTENSIONS } from './storybookFolder';

export type StorybookSetup = 'registers-root' | 'sherlo-in-app' | 'renders-in-app' | 'not-started';

const INDEX_FILES = STORYBOOK_SOURCE_EXTENSIONS.map((extension) => `index${extension}`);
const REGISTERS_A_ROOT = /\bregisterRootComponent\s*\(|\bAppRegistry\.registerComponent\s*\(/;
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
/** Way b)'s import, in any quotes and with any other names beside it. */
const IMPORTS_STORYBOOK_MODE =
  /\bimport\s*\{[^}]*\bisStorybookMode\b[^}]*\}\s*from\s*['"]@sherlo\/react-native-storybook['"]/;
/** Every module a file names: `from '...'`, a bare `import '...'`, `require('...')`, `import('...')`. */
const IMPORTED_MODULE =
  /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;

/**
 * Does `filePath` import the Storybook folder at `storybookPath`, or a file in it? A relative path
 * is resolved from the file; an alias (`@/.rnstorybook`) counts when a part after its first names
 * the folder, so a package (`storybook`, `@storybook/react-native`) never does.
 */
function importsTheFolder(filePath: string, storybookPath: string): boolean {
  return [...fs.readFileSync(filePath, 'utf8').matchAll(IMPORTED_MODULE)].some(([, module]) => {
    if (module.startsWith('.')) {
      const target = path.resolve(path.dirname(filePath), module);
      return target === storybookPath || target.startsWith(`${storybookPath}${path.sep}`);
    }
    return module.split('/').slice(1).includes(path.basename(storybookPath));
  });
}

function storybookSetup(): StorybookSetup {
  const folderName = storybookFolder();

  for (const fileName of folderName ? INDEX_FILES : []) {
    const indexPath = path.join(getCwd(), folderName!, fileName);
    if (fs.existsSync(indexPath) && REGISTERS_A_ROOT.test(fs.readFileSync(indexPath, 'utf8'))) {
      return 'registers-root';
    }
  }

  const asksSherlo = someAppFile(
    (filePath) =>
      CODE_FILE.test(filePath) && IMPORTS_STORYBOOK_MODE.test(fs.readFileSync(filePath, 'utf8'))
  );
  if (asksSherlo) return 'sherlo-in-app';

  const storybookPath = folderName ? path.join(getCwd(), folderName) : null;
  const rendersIt =
    !!storybookPath &&
    someAppFile(
      (filePath) => CODE_FILE.test(filePath) && importsTheFolder(filePath, storybookPath)
    );
  return rendersIt ? 'renders-in-app' : 'not-started';
}

export default storybookSetup;
