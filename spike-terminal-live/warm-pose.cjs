// Spike terminal-live: "keep one node alive" - run `sherlo pose first-setup.pose.json` 6 times in ONE
// node process, re-evaluating the bundle fresh each time (as a live view would after every rebuild),
// and print {loadMs[], runMs[], allSame, text} as JSON. Only stdout up to the first process.exit is
// kept, as a real process would end there.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'packages/cli/dist');
const poseFile = path.join(root, 'packages/cli/poses/init/first-setup.pose.json');
const realWrite = process.stdout.write.bind(process.stdout);
const realErrorWrite = process.stderr.write.bind(process.stderr);
const realExit = process.exit;
const ended = Symbol('posed process ended');

// `--fresh-source`: append a different comment to the bundle's text every round, so V8 cannot reuse
// its in-process compilation of the last round - as after a real rebuild, where the text changed.
let round = 0;
if (process.argv.includes('--fresh-source')) {
  const Module = require('module');
  const compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    return compile.call(this, filename.startsWith(distDir) ? `${content}\n// round ${round}\n` : content, filename);
  };
}

async function runOnce() {
  for (const key of Object.keys(require.cache)) if (key.startsWith(distDir)) delete require.cache[key];
  process.argv = [process.execPath, path.join(root, 'packages/cli/cli.js'), 'pose', poseFile];
  let text = '';
  let exited = false;
  process.stdout.write = (chunk, ...rest) => {
    if (!exited) text += chunk.toString();
    const callback = rest.find((arg) => typeof arg === 'function');
    if (callback) callback();
    return true;
  };
  process.stderr.write = (chunk, ...rest) => {
    const callback = rest.find((arg) => typeof arg === 'function');
    if (callback) callback();
    return true;
  };
  process.exit = () => {
    exited = true;
    throw ended;
  };
  const loadStarted = process.hrtime.bigint();
  const start = require(distDir).default;
  const runStarted = process.hrtime.bigint();
  await start().catch(() => {});
  const runEnded = process.hrtime.bigint();
  process.stdout.write = realWrite;
  process.stderr.write = realErrorWrite;
  process.exit = realExit;
  return { loadMs: Number(runStarted - loadStarted) / 1e6, runMs: Number(runEnded - runStarted) / 1e6, text };
}

async function main() {
  const runs = [];
  for (round = 0; round < 6; round++) runs.push(await runOnce());
  realWrite(JSON.stringify({
    loadMs: runs.map((run) => Math.round(run.loadMs)),
    runMs: runs.map((run) => Math.round(run.runMs)),
    allSame: runs.every((run) => run.text === runs[0].text),
    text: runs[runs.length - 1].text,
  }));
  realExit(0);
}

main();
