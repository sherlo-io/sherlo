/**
 * WHICH OF STORYBOOK'S TWO SETUPS THE APP USES, which decides the Storybook access next step
 * (epic storybook-both-setups settled the rule, 2026-10-07).
 *
 * Storybook 10.4+ makes `.rnstorybook/index` register the app's root itself, and Sherlo's Metro
 * wrapper then swaps the entry at launch: nothing in the app needs changing - Storybook's default
 * setup. The old setup renders
 * Storybook from the app's own root component, so the person adds Sherlo there. One rule for the
 * SDK and setup alike: does `.rnstorybook/index` register a root? No version is read.
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';

export type StorybookSetup = 'registers-root' | 'renders-in-app';

const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];
const REGISTERS_A_ROOT = /\bregisterRootComponent\s*\(|\bAppRegistry\.registerComponent\s*\(/;

function storybookSetup(): StorybookSetup {
  const storybookFolder = path.join(getCwd(), '.rnstorybook');

  for (const fileName of INDEX_FILES) {
    const indexPath = path.join(storybookFolder, fileName);
    if (fs.existsSync(indexPath) && REGISTERS_A_ROOT.test(fs.readFileSync(indexPath, 'utf8'))) {
      return 'registers-root';
    }
  }

  return 'renders-in-app';
}

export default storybookSetup;
