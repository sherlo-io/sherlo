import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';

function getMetroConfigPath(): string | null {
  for (const name of [
    'metro.config.js',
    'metro.config.ts',
    'metro.config.cjs',
    'metro.config.mjs',
  ]) {
    const full = path.join(getCwd(), name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

export default getMetroConfigPath;
