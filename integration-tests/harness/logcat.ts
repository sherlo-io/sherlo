import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { adbBinary, type DeviceSerial } from './adb.js';

export interface LogcatTailer {
  /** Stop the background adb logcat process. Idempotent. */
  stop(): void;
  /** Return all captured lines so far. Reads from the on-disk capture file. */
  read(): string;
  /** Path to the on-disk capture file. */
  filePath: string;
}

const DEFAULT_FILTER = 'sherlo|ReactNativeJS|fatal|androidruntime|threadid|exception';
const INTEGRATION_TESTS_DIR = path.resolve(__dirname, '..');
const LOGCATS_DIR = path.join(INTEGRATION_TESTS_DIR, '.logcats');

function pruneLogcats(dir: string, keep = 20): void {
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.log'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const f of files.slice(keep)) {
    fs.unlinkSync(path.join(dir, f.name));
  }
}

export function startLogcatTailer(opts: {
  serial: DeviceSerial;
  outFile?: string;
  filterPattern?: string;
}): LogcatTailer {
  const { serial } = opts;
  const filterRegex = new RegExp(opts.filterPattern ?? DEFAULT_FILTER, 'i');

  fs.mkdirSync(LOGCATS_DIR, { recursive: true });
  pruneLogcats(LOGCATS_DIR);

  const ts = Date.now().toString(36);
  const filePath = opts.outFile ?? path.join(LOGCATS_DIR, `.logcat-${serial}-${ts}.log`);

  fs.writeFileSync(filePath, '');

  const child = spawn(adbBinary(), ['-s', serial, 'logcat', '-v', 'brief', '*:V'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  child.stdout.on('data', (chunk: Buffer) => {
    const lines = chunk.toString('utf8').split('\n');
    for (const line of lines) {
      if (line && filterRegex.test(line)) {
        fs.appendFileSync(filePath, line + '\n');
      }
    }
  });

  let stopped = false;

  return {
    filePath,
    stop() {
      if (stopped) return;
      stopped = true;
      try { child.kill(); } catch { /* already dead */ }
    },
    read() {
      return fs.readFileSync(filePath, 'utf8');
    },
  };
}
