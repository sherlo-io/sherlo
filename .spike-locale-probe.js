// Spike probe (not for commit): does @expo/fingerprint's dir ordering
// (dirents sorted with String.prototype.localeCompare) depend on the
// process locale? Runs the CLI's own `fingerprint --layer base` under
// several LANG/LC_ALL values and prints the digest each gives.
const { spawnSync } = require('child_process');
const path = require('path');

const cli = path.join(__dirname, 'packages/cli/cli.js');
const projectRoot = process.argv[2];

const names = ['README.md', 'android', 'build.gradle', 'Podfile', '_private', 'a-b', 'a_b', 'aB', 'Ab'];
for (const lang of ['en_US.UTF-8', 'C.UTF-8', 'C', 'POSIX']) {
  const sorted = spawnSync(
    process.execPath,
    ['-e', `console.log(JSON.stringify(${JSON.stringify(names)}.sort((a,b)=>a.localeCompare(b))) + ' ' + Intl.DateTimeFormat().resolvedOptions().locale)`],
    { env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: lang, LC_ALL: lang }, encoding: 'utf8' }
  );
  console.log(`sort  LANG=${lang}: ${sorted.stdout.trim()}`);
}

if (projectRoot) {
  for (const lang of ['en_US.UTF-8', 'C.UTF-8']) {
    const result = spawnSync(process.execPath, [cli, 'fingerprint', '--layer', 'base'], {
      cwd: projectRoot,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: lang, LC_ALL: lang },
      encoding: 'utf8',
    });
    console.log(`base  LANG=${lang}: ${result.stdout.trim()} ${result.stderr.trim().slice(0, 200)}`);
  }
}
