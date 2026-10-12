// Spike terminal-live: one bundler in watch mode, timed end to end the way the live view would use it.
//   node spike-terminal-live/bench.cjs <ncc|esbuild|esbuild-fswatch|rolldown>
// Cold build (spawn -> first build done), 5 saved edits of src/render/login.ts (save -> build done ->
// `node packages/cli/cli.js pose first-setup.pose.json` printed), the watcher's memory (its process
// tree), and the printed text saved to out-<tool>.txt for a byte comparison. Restores every file it edits.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tool = process.argv[2];
const root = path.join(__dirname, '..');
const cliDir = path.join(root, 'packages', 'cli');
const poseFile = path.join(cliDir, 'poses/init/first-setup.pose.json');
const renderFile = path.join(cliDir, 'src/render/login.ts');
const renderOld = 'Opening your browser to log in to Sherlo...';

const watchers = {
  ncc: { command: path.join(root, 'node_modules', '.bin', 'ncc'), args: ['build', 'src/index.ts', '-o', 'dist', '--watch', '--transpile-only', '--external', '@expo/fingerprint'], done: /Watching for changes/ },
  esbuild: { command: process.execPath, args: [path.join(__dirname, 'watch-esbuild.cjs')], done: /^BUILT / },
  'esbuild-fswatch': { command: process.execPath, args: [path.join(__dirname, 'watch-esbuild.cjs'), '--rebuild-on-fs-watch'], done: /^BUILT / },
  rolldown: { command: process.execPath, args: [path.join(__dirname, 'watch-rolldown.mjs')], done: /^BUILT / },
};
const watcher = watchers[tool];
if (!watcher) throw new Error(`unknown tool ${tool}`);

function pose() {
  const started = process.hrtime.bigint();
  let out;
  try {
    out = execFileSync(process.execPath, ['packages/cli/cli.js', 'pose', poseFile], { cwd: root, env: { ...process.env, FORCE_COLOR: '1', SHERLO_DEVTOOLS: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    out = error.stdout || '';
  }
  return { ms: Number(process.hrtime.bigint() - started) / 1e6, out };
}

function treeRssMb(pid) {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
  const inTree = new Set([pid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [child, parent] of rows) if (inTree.has(parent) && !inTree.has(child)) { inTree.add(child); grew = true; }
  }
  return Math.round(rows.filter(([child]) => inTree.has(child)).reduce((sum, [, , rss]) => sum + rss, 0) / 1024);
}

const builds = [];
let peakRssMb = 0;
const log = [];

async function waitForBuild(count, since) {
  while (builds.length < count) {
    if (Date.now() - since > 60000) throw new Error(`no build within 60 s\n${log.slice(-20).join('\n')}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return builds[count - 1] - since;
}

async function main() {
  const results = { tool, cpus: os.cpus().length, loadAverage: os.loadavg().map((n) => n.toFixed(2)) };
  fs.rmSync(path.join(cliDir, 'dist'), { recursive: true, force: true });

  const startedAt = Date.now();
  const child = spawn(watcher.command, watcher.args, { cwd: cliDir, stdio: ['ignore', 'pipe', 'pipe'] });
  let pending = '';
  const onData = (chunk) => {
    const now = Date.now();
    pending += chunk.toString();
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) {
      log.push(line);
      if (watcher.done.test(line)) builds.push(now);
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const sampler = setInterval(() => { peakRssMb = Math.max(peakRssMb, treeRssMb(child.pid)); }, 100);

  const renderOriginal = fs.readFileSync(renderFile, 'utf8');
  try {
    results.coldBuildMs = await waitForBuild(1, startedAt);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    results.rssIdleMb = treeRssMb(child.pid);

    const first = pose();
    fs.writeFileSync(path.join(__dirname, `out-${tool}.txt`), first.out);
    results.printedBytes = first.out.length;
    results.posePrinted = first.out.includes(renderOld);
    results.poseAloneMs = [first.ms, ...[1, 2, 3, 4].map(() => pose().ms)].map(Math.round);

    results.edits = [];
    for (let round = 1; round <= 5; round++) {
      const marker = `LIVE-EDIT-${round}-${Date.now()}`;
      const before = builds.length;
      const savedAt = Date.now();
      fs.writeFileSync(renderFile, renderOriginal.replace(renderOld, `${marker} ${renderOld}`));
      const rebuildMs = await waitForBuild(before + 1, savedAt);
      const run = pose();
      results.edits.push({ rebuildMs, poseMs: Math.round(run.ms), totalMs: Date.now() - savedAt, shown: run.out.includes(marker) });
      // Let a second, late build (some watchers fire twice per save) settle before the next round.
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  } finally {
    const before = builds.length;
    fs.writeFileSync(renderFile, renderOriginal);
    await waitForBuild(before + 1, Date.now()).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 500));
    clearInterval(sampler);
    results.rssEndMb = treeRssMb(child.pid);
    results.rssPeakMb = peakRssMb;
    results.buildsSeen = builds.length;
    child.kill('SIGTERM');
  }
  const final = pose();
  results.restoredPrintMatches = final.out === fs.readFileSync(path.join(__dirname, `out-${tool}.txt`), 'utf8');
  const sorted = (values) => [...values].sort((a, b) => a - b);
  results.summary = {
    rebuildMs: sorted(results.edits.map((edit) => edit.rebuildMs)),
    totalMs: sorted(results.edits.map((edit) => edit.totalMs)),
    allShown: results.edits.every((edit) => edit.shown),
  };
  fs.writeFileSync(path.join(__dirname, `result-${tool}.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (log.some((line) => /error/i.test(line))) console.log(log.filter((line) => /error/i.test(line)).slice(0, 20).join('\n'));
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
