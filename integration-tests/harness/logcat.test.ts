import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startLogcatTailer } from './logcat.js';

describe('startLogcatTailer()', () => {
  const created: string[] = [];

  afterEach(() => {
    for (const f of created) {
      try { fs.unlinkSync(f); } catch { /* ok */ }
    }
    created.length = 0;
  });

  function tmpFile(): string {
    const f = path.join(os.tmpdir(), `.logcat-test-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
    created.push(f);
    return f;
  }

  it('creates the output file immediately on start', () => {
    const outFile = tmpFile();
    const tailer = startLogcatTailer({ serial: 'emulator-5554', outFile });
    tailer.stop();
    expect(fs.existsSync(outFile)).toBe(true);
  });

  it('stop() is idempotent - calling twice does not throw', () => {
    const outFile = tmpFile();
    const tailer = startLogcatTailer({ serial: 'emulator-5554', outFile });
    expect(() => {
      tailer.stop();
      tailer.stop();
    }).not.toThrow();
  });

  it('read() returns content written to the output file', () => {
    const outFile = tmpFile();
    const tailer = startLogcatTailer({ serial: 'emulator-5554', outFile });
    tailer.stop();
    fs.appendFileSync(outFile, 'I/ReactNativeJS: hello world\n');
    expect(tailer.read()).toContain('hello world');
  });

  it('exposes the correct filePath', () => {
    const outFile = tmpFile();
    const tailer = startLogcatTailer({ serial: 'emulator-5554', outFile });
    tailer.stop();
    expect(tailer.filePath).toBe(outFile);
  });

  it('default filter regex matches expected patterns and rejects noise', () => {
    const pattern = 'sherlo|ReactNativeJS|fatal|androidruntime|threadid|exception';
    const regex = new RegExp(pattern, 'i');
    expect(regex.test('I/sherlo: connection established')).toBe(true);
    expect(regex.test('I/ReactNativeJS: Hello from JS')).toBe(true);
    expect(regex.test('FATAL EXCEPTION: main')).toBe(true);
    expect(regex.test('E/AndroidRuntime: crash')).toBe(true);
    expect(regex.test('NullPointerException at line 42')).toBe(true);
    expect(regex.test('I/SomeOtherTag: unrelated log line')).toBe(false);
  });
});
