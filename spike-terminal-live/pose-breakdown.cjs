// Spike terminal-live: where the ~0.25 s of one `sherlo pose` run goes, and what cuts it.
//   node spike-terminal-live/pose-breakdown.cjs
// Needs a built packages/cli/dist. Times (median of 7, wall clock from the parent):
//   nodeStart    - node running an empty script
//   loadBundle   - node requiring packages/cli/dist (module load, no command run)
//   poseCold     - the real `node packages/cli/cli.js pose first-setup.pose.json`
//   poseCompileCache - the same with NODE_COMPILE_CACHE (V8 code cache on disk, node >= 22.1)
//   warm*        - one long-lived node process: re-evaluate the bundle fresh and run the pose in-process
//                  (warm-pose.cjs), which is what "keep one node alive" would cost per save.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const poseFile = path.join(root, 'packages/cli/poses/init/first-setup.pose.json');
const env = { ...process.env, FORCE_COLOR: '1', SHERLO_DEVTOOLS: '1' };
const cacheDir = path.join(__dirname, '.compile-cache');

function time(args, extraEnv = {}) {
  const started = process.hrtime.bigint();
  let out;
  try {
    out = execFileSync(process.execPath, args, { cwd: root, env: { ...env, ...extraEnv }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    out = error.stdout || '';
  }
  return { ms: Number(process.hrtime.bigint() - started) / 1e6, out };
}

function median(args, extraEnv) {
  const runs = Array.from({ length: 7 }, () => time(args, extraEnv));
  const sorted = runs.map((run) => run.ms).sort((a, b) => a - b);
  return { medianMs: Math.round(sorted[3]), minMs: Math.round(sorted[0]), out: runs[0].out };
}

fs.rmSync(cacheDir, { recursive: true, force: true });
const results = { node: process.version, loadAverage: os.loadavg().map((n) => n.toFixed(2)) };
results.bundleBytes = fs.statSync(path.join(root, 'packages/cli/dist/index.js')).size;
results.nodeStart = median([path.join(__dirname, 'empty.cjs')]);
results.loadBundle = median([path.join(__dirname, 'load-bundle.cjs')]);
results.poseCold = median(['packages/cli/cli.js', 'pose', poseFile]);
time(['packages/cli/cli.js', 'pose', poseFile], { NODE_COMPILE_CACHE: cacheDir });
results.poseCompileCache = median(['packages/cli/cli.js', 'pose', poseFile], { NODE_COMPILE_CACHE: cacheDir });
results.poseCompileCache.sameText = results.poseCompileCache.out === results.poseCold.out;
const warm = JSON.parse(time([path.join(__dirname, 'warm-pose.cjs')]).out);
results.warm = { ...warm, sameText: warm.text === results.poseCold.out };
delete results.warm.text;
const warmFresh = JSON.parse(time([path.join(__dirname, 'warm-pose.cjs'), '--fresh-source']).out);
results.warmFreshSource = { ...warmFresh, sameText: warmFresh.text === results.poseCold.out };
delete results.warmFreshSource.text;
for (const key of ['nodeStart', 'loadBundle', 'poseCold', 'poseCompileCache']) delete results[key].out;
fs.rmSync(cacheDir, { recursive: true, force: true });
console.log(JSON.stringify(results, null, 2));
