import * as fs from 'fs';
import * as path from 'path';

function detectEntryFile(projectRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    if (typeof pkg.main === 'string' && pkg.main.length > 0) return pkg.main;
  } catch { /* ignore */ }
  return 'index.js';
}

export default detectEntryFile;
