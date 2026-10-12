// Spike terminal-live: run the CLI bundler in watch mode exactly as brain's plan services do,
// stamping every output line with the wall clock (ms) so a rebuild can be timed against a save.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const cliDir = path.join(__dirname, '..', 'packages', 'cli');
const ncc = path.join(__dirname, '..', 'node_modules', '.bin', 'ncc');
const logFile = path.join(__dirname, 'watch.log');
fs.writeFileSync(logFile, '');
fs.writeFileSync(path.join(__dirname, 'watch.pid'), String(process.pid));

const child = spawn(ncc, ['build', 'src/index.ts', '-o', 'dist', '--watch', '--transpile-only', '--external', '@expo/fingerprint'], { cwd: cliDir });
fs.writeFileSync(path.join(__dirname, 'ncc.pid'), String(child.pid));

function stamp(chunk) {
  for (const line of chunk.toString().split('\n')) {
    if (line.trim() !== '') fs.appendFileSync(logFile, `${Date.now()} ${line}\n`);
  }
}
child.stdout.on('data', stamp);
child.stderr.on('data', stamp);
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGTERM', () => child.kill('SIGTERM'));
