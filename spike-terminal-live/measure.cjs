// Spike terminal-live: time save -> rebuilt bundle -> `sherlo pose` printout, the way brain draws a cli pose.
// Needs spike-terminal-live/watch.cjs running (ncc --watch --transpile-only). Restores every file it edits.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const watchLog = path.join(__dirname, 'watch.log');
const poseFile = path.join(root, 'packages/cli/poses/init/first-setup.pose.json');
const renderFile = path.join(root, 'packages/cli/src/render/login.ts');
const renderOld = 'Opening your browser to log in to Sherlo...';

function pose() {
  const started = Date.now();
  let out;
  try {
    out = execFileSync('node', ['packages/cli/cli.js', 'pose', poseFile], { cwd: root, env: { ...process.env, FORCE_COLOR: '1', SHERLO_DEVTOOLS: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    out = err.stdout || '';
  }
  return { ms: Date.now() - started, out };
}

function rebuildsDone() {
  return fs.readFileSync(watchLog, 'utf8').split('\n').filter((line) => line.includes('Watching for changes')).length;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForRebuild(before, savedAt) {
  while (rebuildsDone() <= before) {
    if (Date.now() - savedAt > 60000) throw new Error('no rebuild within 60 s');
    sleep(20);
  }
  const last = fs.readFileSync(watchLog, 'utf8').split('\n').filter((line) => line.includes('Watching for changes')).pop();
  return Number(last.split(' ')[0]) - savedAt;
}

const results = {};
const ncc = Number(fs.readFileSync(path.join(__dirname, 'ncc.pid'), 'utf8'));
const rssKb = () => Number(execFileSync('ps', ['-o', 'rss=', '-p', String(ncc)], { encoding: 'utf8' }).trim());
results.rssIdleMb = Math.round(rssKb() / 1024);

// 1. pose alone, unchanged bundle
const first = pose();
results.poseFirstMs = first.ms;
results.poseWarmMs = [1, 2, 3, 4, 5].map(() => pose().ms);
results.printsOld = first.out.includes(renderOld);
fs.writeFileSync(path.join(__dirname, 'first-setup.ansi.txt'), first.out);
if (process.argv.includes('--only-print')) process.exit(0);
results.outputHead = JSON.stringify(first.out.slice(0, 300));
results.hasAnsi = first.out.includes('\x1b[');
results.hasHtml = /<html|<span|<pre/.test(first.out);

// 2. render-code edit: save -> rebuild -> pose
const renderOriginal = fs.readFileSync(renderFile, 'utf8');
const renderRuns = [];
try {
  for (let round = 1; round <= 3; round++) {
    const marker = `LIVE-EDIT-${round}-${Date.now()}`;
    const before = rebuildsDone();
    const savedAt = Date.now();
    fs.writeFileSync(renderFile, renderOriginal.replace(renderOld, `${marker} ${renderOld}`));
    const rebuildMs = waitForRebuild(before, savedAt);
    const run = pose();
    renderRuns.push({ rebuildMs, poseMs: run.ms, totalMs: Date.now() - savedAt, shown: run.out.includes(marker) });
    results.rssAfterRebuildMb = Math.round(rssKb() / 1024);
  }
} finally {
  const before = rebuildsDone();
  fs.writeFileSync(renderFile, renderOriginal);
  waitForRebuild(before, Date.now());
}
results.renderEdit = renderRuns;

// 3. pose-document edit: save -> pose (no rebuild needed; the document is read at run time)
const poseOriginal = fs.readFileSync(poseFile, 'utf8');
try {
  const marker = `live-doc-${Date.now()}`;
  const before = rebuildsDone();
  const savedAt = Date.now();
  fs.writeFileSync(poseFile, poseOriginal.replaceAll("Anna's team", marker));
  const run = pose();
  sleep(1500);
  results.poseDocEdit = { poseMs: run.ms, totalMs: run.ms + 0, shown: run.out.includes(marker), triggeredRebuild: rebuildsDone() > before };
} finally {
  fs.writeFileSync(poseFile, poseOriginal);
}
results.rssEndMb = Math.round(rssKb() / 1024);
console.log(JSON.stringify(results, null, 2));
