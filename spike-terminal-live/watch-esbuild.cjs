// Spike terminal-live: esbuild (Go) in watch mode, building packages/cli the way the pose needs it.
// Prints `BUILT <errors>` after every build. `--rebuild-on-fs-watch` replaces esbuild's own
// polling watcher with node's fs.watch on src/ calling ctx.rebuild() (incremental).
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const cliDir = path.join(__dirname, '..', 'packages', 'cli');
const useFsWatch = process.argv.includes('--rebuild-on-fs-watch');

async function main() {
  const context = await esbuild.context({
    absWorkingDir: cliDir,
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile: 'dist/index.js',
    external: ['@expo/fingerprint'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'report-each-build',
        setup(build) {
          build.onEnd((result) => {
            for (const error of result.errors) console.error(error.text);
            console.log(`BUILT ${result.errors.length}`);
          });
        },
      },
    ],
  });

  if (!useFsWatch) {
    await context.watch();
    return;
  }

  await context.rebuild();
  let running = false;
  let again = false;
  async function rebuild() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    do {
      again = false;
      await context.rebuild().catch(() => {});
    } while (again);
    running = false;
  }
  fs.watch(path.join(cliDir, 'src'), { recursive: true }, rebuild);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
