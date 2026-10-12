// Spike terminal-live: Rolldown (Rust) in watch mode, building packages/cli the way the pose needs it.
// Prints `BUILT <errors>` after every build.
import path from 'path';
import { fileURLToPath } from 'url';
import { watch } from 'rolldown';

const cliDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'cli');

const watcher = watch({
  cwd: cliDir,
  input: path.join(cliDir, 'src/index.ts'),
  platform: 'node',
  external: ['@expo/fingerprint'],
  logLevel: 'silent',
  // With the default (tsconfig: true) Rolldown 1.0.0-rc.16 cannot resolve the relative requires
  // inside the symlinked portal libraries (sherlo-lib/extracted/@sherlo/*): "Could not resolve
  // './env.json'". tsconfig: false (or resolve.symlinks: false) builds; see try-rolldown.mjs.
  tsconfig: false,
  watch: { clearScreen: false },
  output: {
    file: path.join(cliDir, 'dist/index.js'),
    format: 'cjs',
    codeSplitting: false,
    exports: 'named',
  },
});

let errors = 0;
watcher.on('event', (event) => {
  if (event.code === 'BUNDLE_END') event.result.close();
  if (event.code === 'ERROR') {
    errors += 1;
    console.error(event.error && event.error.message);
    event.result.close();
  }
  if (event.code === 'END' || event.code === 'ERROR') {
    console.log(`BUILT ${errors}`);
    errors = 0;
  }
});
