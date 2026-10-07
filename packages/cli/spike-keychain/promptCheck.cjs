// SPIKE: does macOS prompt when a node binary OTHER than the one that saved a keychain entry reads it?
// The entry is written by the node running this file; each other node reads it with a 20 s limit. A
// read that does not come back within the limit is blocked on a "node wants to use your confidential
// information" dialog, and is killed. The entry is deleted at the end.
const { spawnSync } = require('child_process');
const path = require('path');

const account = 'https://spike-prompt.invalid/graphql';
const helper = path.join(__dirname, 'readEntry.cjs');
const otherNodes = process.argv.slice(2);

function run(node, act) {
  const result = spawnSync(node, [helper, act, account], { encoding: 'utf8', timeout: 20000 });
  const outcome = result.error ? `NO ANSWER in 20 s (${result.error.code}) - blocked on a prompt` : (result.stdout + result.stderr).trim();
  console.log(`[${node}] ${act}: ${outcome}`);
}

try {
  run(process.execPath, 'write');
  run(process.execPath, 'read');
  for (const node of otherNodes) run(node, 'read');
} finally {
  run(process.execPath, 'delete');
}
