/**
 * PACK THE SDK AS A PUBLISH PACKS IT, once, for the SDK suite's packaging rules to read.
 *
 *     node scripts/packAsPublished.js <folder>      from packages/react-native-storybook
 *
 * Writes two tarballs into <folder>:
 *
 * - npm.tgz: `npm pack`, prepack and all, with no core laid beforehand - so the pack fetches the
 *   pinned core with PACKAGE_TOKEN, exactly as a publish does.
 * - yarn.tgz: the same package packed by the repository's own yarn, whose file list npm's does
 *   not decide.
 *
 * The pull request check runs this as a step before the SDK suite and hands the suite the folder
 * in SHERLO_SDK_PACKS (src/__tests__/sealedCorePackaging.test.ts reads it). Packing fetches a core
 * and builds the bundler plugin - seconds a unit suite is not for - so it is done once, here.
 *
 * It leaves the SDK as it found it: the laid core is removed again on the way out.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { LAID_PATHS } = require('./packSealedCore.js');

const SDK_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SDK_ROOT, '..', '..');

/** Every path a pack lays the core at, removed, so a pack must lay each again. */
function removeLaidCore() {
  for (const { inSdk } of LAID_PATHS) {
    fs.rmSync(path.join(SDK_ROOT, inSdk), { recursive: true, force: true });
  }
}

function packAsPublished(packsDir) {
  fs.rmSync(packsDir, { recursive: true, force: true });
  fs.mkdirSync(packsDir, { recursive: true });

  removeLaidCore();
  try {
    // npm names the tarball after the package's name and version; the folder is empty, so the one
    // tarball in it is this pack's.
    execFileSync('npm', ['pack', '--pack-destination', packsDir], {
      cwd: SDK_ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const npmTarball = fs.readdirSync(packsDir).find((name) => name.endsWith('.tgz'));
    fs.renameSync(path.join(packsDir, npmTarball), path.join(packsDir, 'npm.tgz'));

    const yarnReleasePath = fs
      .readFileSync(path.join(REPO_ROOT, '.yarnrc.yml'), 'utf8')
      .match(/^yarnPath:\s*(\S+)\s*$/m)[1];
    execFileSync(
      'node',
      [path.join(REPO_ROOT, yarnReleasePath), 'pack', '-o', path.join(packsDir, 'yarn.tgz')],
      { cwd: SDK_ROOT, stdio: ['ignore', 'ignore', 'inherit'] }
    );
  } finally {
    removeLaidCore();
  }
}

const packsDirArgument = process.argv[2];
if (!packsDirArgument) {
  console.error('usage: node scripts/packAsPublished.js <folder>');
  process.exit(1);
}
packAsPublished(path.resolve(packsDirArgument));
console.log(`packed the SDK as a publish does: ${path.resolve(packsDirArgument)}/{npm,yarn}.tgz`);
