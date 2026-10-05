// SPIKE android-lib-splice: pack the SDK from this copy (its prepack builds both sealed cores) into
// examples/standard/sherlo-lib, then install the example against it.
// `node spike-out/prepare.js [pack] [install]` - the named steps, or both.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SDK = path.join(ROOT, 'packages', 'react-native-storybook');
const EXAMPLE = path.join(ROOT, 'examples', 'standard');
const TARBALL = path.join(EXAMPLE, 'sherlo-lib', 'react-native-storybook.tgz');

function run(cwd, tool, args) {
  console.log('> (' + path.relative(ROOT, cwd) + ') ' + tool + ' ' + args.join(' '));
  execFileSync(tool, args, { cwd, stdio: 'inherit' });
}

const steps = {
  pack() {
    fs.mkdirSync(path.dirname(TARBALL), { recursive: true });
    run(SDK, 'yarn', ['pack', '--out', TARBALL]);
  },
  install() {
    run(EXAMPLE, 'yarn', ['install']);
  },
};

const named = process.argv.slice(2);
for (const name of named.length > 0 ? named : Object.keys(steps)) steps[name]();
