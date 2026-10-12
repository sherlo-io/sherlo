// Spike terminal-live: one-shot Rolldown builds in a few option variants, to find why it cannot
// resolve the relative requires inside the portal libraries (sherlo-lib/extracted/@sherlo/*).
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'rolldown';

const cliDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'cli');
const base = {
  input: path.join(cliDir, 'src/index.ts'),
  platform: 'node',
  external: ['@expo/fingerprint'],
  logLevel: 'silent',
  write: false,
  output: { format: 'cjs', codeSplitting: false, exports: 'named' },
};
const variants = {
  asWatched: { cwd: cliDir },
  noCwd: {},
  noTsconfig: { cwd: cliDir, tsconfig: false },
  noSymlinks: { cwd: cliDir, resolve: { symlinks: false } },
};
for (const [name, extra] of Object.entries(variants)) {
  const started = Date.now();
  try {
    await build({ ...base, ...extra });
    console.log(name, 'ok', Date.now() - started, 'ms');
  } catch (error) {
    console.log(name, 'FAILED', Date.now() - started, 'ms', String(error.message).split('\n').slice(0, 3).join(' | '));
  }
}
