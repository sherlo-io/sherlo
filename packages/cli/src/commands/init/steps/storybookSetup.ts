/**
 * WHICH OF STORYBOOK'S SETUPS THE APP USES, which decides the Storybook access next step.
 *
 * Storybook 10.4+ makes its folder's index (`.rnstorybook/index`, or wherever ./storybookFolder finds
 * the folder) register the app's root itself, and Sherlo's Metro wrapper then swaps the entry at launch: nothing in the app needs changing - Storybook's default
 * setup. The old setup renders Storybook from the app's own root component. When the app's code
 * already asks Sherlo's `isStorybookMode` (the next steps' way b), Sherlo opens Storybook there
 * too, so a rerun after way b) has nothing left to set up. No version is read.
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import someAppFile from './someAppFile';
import storybookFolder from './storybookFolder';

export type StorybookSetup = 'registers-root' | 'sherlo-in-app' | 'renders-in-app';

const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];
const REGISTERS_A_ROOT = /\bregisterRootComponent\s*\(|\bAppRegistry\.registerComponent\s*\(/;
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
/** Way b)'s import, in any quotes and with any other names beside it. */
const IMPORTS_STORYBOOK_MODE =
  /\bimport\s*\{[^}]*\bisStorybookMode\b[^}]*\}\s*from\s*['"]@sherlo\/react-native-storybook['"]/;

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
  return asksSherlo ? 'sherlo-in-app' : 'renders-in-app';
}

export default storybookSetup;
