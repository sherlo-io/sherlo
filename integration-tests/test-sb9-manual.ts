import { applySbVersion, resetSbVersion } from './harness/sb-version.js';
import { existsSync } from 'node:fs';
import path from 'node:path';

const requiresFile = path.join(process.cwd(), 'apps/integrated-app-bare-rn/.rnstorybook/storybook.requires.ts');

console.log('Before:', existsSync(requiresFile));
applySbVersion('integrated-app-bare-rn', 'sb9');
console.log('After applySbVersion:', existsSync(requiresFile));
resetSbVersion('integrated-app-bare-rn');
console.log('After reset:', existsSync(requiresFile));
