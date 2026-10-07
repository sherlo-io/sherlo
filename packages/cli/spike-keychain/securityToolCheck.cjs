// SPIKE: approach (b) on macOS - shelling out to /usr/bin/security.
//  1. A token passed as `-w <token>` is in the process's argument list: does `ps` show it?
//  2. Fed through `security -i` on stdin (hex, `-X`), is it kept out of `ps`?
//  3. Can a node binary that saved nothing read it back through `security` without a prompt?
// The made-up entries are deleted at the end.
const { spawn, spawnSync } = require('child_process');

const SERVICE = 'sherlo-spike-security';
const ACCOUNT_ARGV = 'https://spike-argv.invalid/graphql';
const ACCOUNT_STDIN = 'https://spike-stdin.invalid/graphql';
const MARKER = 'sht_SPIKEARGVMARKER_not_real';
const VALUE = JSON.stringify({ token: MARKER, email: 'spike@example.com' });

function psShowsMarker() {
  const ps = spawnSync('ps', ['-axww', '-o', 'pid=,args='], { encoding: 'utf8' }).stdout;
  return ps.split('\n').filter((line) => line.includes(MARKER) && !line.includes('ps -axww')).map((l) => l.trim().slice(0, 60) + '...');
}

function waitFor(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => child.on('exit', (code) => resolve(code)));
}

(async () => {
  try {
    // 1. -w on the argument list.
    const argvChild = spawn('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', ACCOUNT_ARGV, '-w', VALUE]);
    let seenWithArgv = [];
    let psRuns = 0;
    // Look again and again while it runs, letting the event loop finish the spawn between looks: a
    // look taken before exec sees node's fork, not security.
    for (; psRuns < 30 && seenWithArgv.length === 0 && argvChild.exitCode === null; psRuns++) {
      await new Promise((resolve) => setTimeout(resolve, 2));
      seenWithArgv = psShowsMarker();
    }
    console.log('   ps looks taken:', psRuns);
    console.log('1. argv write exit', await waitFor(argvChild), '- ps lines showing the token:', seenWithArgv.length, seenWithArgv);

    // 2. security -i, the command on stdin, the value as hex.
    const stdinChild = spawn('security', ['-i'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const hex = Buffer.from(VALUE, 'utf8').toString('hex');
    stdinChild.stdin.write(`add-generic-password -U -s ${SERVICE} -a ${ACCOUNT_STDIN} -X ${hex}\n`);
    const seenWithStdin = psShowsMarker();
    stdinChild.stdin.end();
    console.log('2. stdin write exit', await waitFor(stdinChild), '- ps lines showing the token:', seenWithStdin.length);

    // 3. read back through security (the item's creator, so its trusted app): value printed on stdout.
    const started = Date.now();
    const read = spawnSync('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT_STDIN, '-w'], { encoding: 'utf8', timeout: 20000 });
    console.log('3. read via security:', read.error ? `NO ANSWER (${read.error.code})` : read.stdout.trim() === VALUE ? 'value matches' : `mismatch: ${read.status}`, `${Date.now() - started} ms`, 'by', process.execPath);
  } finally {
    for (const account of [ACCOUNT_ARGV, ACCOUNT_STDIN]) {
      const removed = spawnSync('security', ['delete-generic-password', '-s', SERVICE, '-a', account], { encoding: 'utf8' });
      console.log('cleanup', account, 'exit', removed.status);
    }
  }
})();
