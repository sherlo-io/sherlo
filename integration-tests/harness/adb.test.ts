import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import * as adb from './adb.js';

const mockExec = vi.mocked(execFileSync);
const SERIAL = 'emulator-5554';

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env['ANDROID_HOME'];
  delete process.env['ANDROID_SDK_ROOT'];
});

// ── devices() ──────────────────────────────────────────────────────────────

describe('devices()', () => {
  it('parses connected device', () => {
    mockExec.mockReturnValue('List of devices attached\nemulator-5554\tdevice product:sdk_gphone64_x86_64\n');
    const result = adb.devices();
    expect(result).toEqual([{ serial: 'emulator-5554', state: 'device' }]);
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['devices', '-l'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  it('parses offline and unauthorized states', () => {
    mockExec.mockReturnValue(
      'List of devices attached\nabc123\toffline\ndef456\tunauthorized\n'
    );
    const result = adb.devices();
    expect(result).toEqual([
      { serial: 'abc123', state: 'offline' },
      { serial: 'def456', state: 'unauthorized' },
    ]);
  });

  it('returns empty array when no devices', () => {
    mockExec.mockReturnValue('List of devices attached\n\n');
    expect(adb.devices()).toEqual([]);
  });
});

// ── shell() ─────────────────────────────────────────────────────────────────

describe('shell()', () => {
  it('builds correct argv', () => {
    mockExec.mockReturnValue('output\n');
    adb.shell(SERIAL, 'echo hello');
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['-s', SERIAL, 'shell', 'echo hello'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  it('returns trimmed stdout', () => {
    mockExec.mockReturnValue('  hello world  \n');
    expect(adb.shell(SERIAL, 'echo hello world')).toBe('hello world');
  });

  it('passes custom timeout', () => {
    mockExec.mockReturnValue('');
    adb.shell(SERIAL, 'sleep 1', { timeout: 5000 });
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ timeout: 5000 })
    );
  });

  it('wraps stderr in error message', () => {
    const err = Object.assign(new Error('exit 1'), { stderr: 'device not found' });
    mockExec.mockImplementation(() => { throw err; });
    expect(() => adb.shell(SERIAL, 'bad cmd')).toThrow('device not found');
  });
});

// ── push() ──────────────────────────────────────────────────────────────────

describe('push()', () => {
  it('builds correct argv', () => {
    mockExec.mockReturnValue('');
    adb.push(SERIAL, '/host/file.txt', '/sdcard/file.txt');
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['-s', SERIAL, 'push', '/host/file.txt', '/sdcard/file.txt'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });
});

// ── pull() ──────────────────────────────────────────────────────────────────

describe('pull()', () => {
  it('builds correct argv', () => {
    mockExec.mockReturnValue('');
    adb.pull(SERIAL, '/sdcard/file.txt', '/host/file.txt');
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['-s', SERIAL, 'pull', '/sdcard/file.txt', '/host/file.txt'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });
});

// ── forceStop() ─────────────────────────────────────────────────────────────

describe('forceStop()', () => {
  it('sends am force-stop command', () => {
    mockExec.mockReturnValue('');
    adb.forceStop(SERIAL, 'com.example.app');
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['-s', SERIAL, 'shell', 'am force-stop com.example.app'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  it('does not throw when adb fails (best-effort)', () => {
    mockExec.mockImplementation(() => { throw new Error('device offline'); });
    expect(() => adb.forceStop(SERIAL, 'com.example.app')).not.toThrow();
  });
});

// ── pidOf() ─────────────────────────────────────────────────────────────────

describe('pidOf()', () => {
  it('returns trimmed pid when process is running', () => {
    mockExec.mockReturnValue('12345\n');
    expect(adb.pidOf(SERIAL, 'com.example.app')).toBe('12345');
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['-s', SERIAL, 'shell', 'pidof com.example.app'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  it('returns empty string when process is not running', () => {
    mockExec.mockReturnValue('\n');
    expect(adb.pidOf(SERIAL, 'com.example.app')).toBe('');
  });

  it('returns empty string when adb throws', () => {
    mockExec.mockImplementation(() => { throw new Error('process not found'); });
    expect(adb.pidOf(SERIAL, 'com.example.app')).toBe('');
  });
});

// ── install() ───────────────────────────────────────────────────────────────

describe('install()', () => {
  it('without packageName: uses -r reinstall flag only', () => {
    mockExec.mockReturnValue('');
    adb.install(SERIAL, '/path/app.apk');
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['-s', SERIAL, 'install', '-r', '/path/app.apk'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  it('with packageName: force-stops, uninstalls, installs, then waits for pm path', () => {
    mockExec
      .mockReturnValueOnce('')                                           // am force-stop
      .mockReturnValueOnce('Success\n')                                  // uninstall
      .mockReturnValueOnce('')                                           // adb install -r
      .mockReturnValueOnce('package:/data/app/com.example.app-1.apk'); // pm path → registered

    adb.install(SERIAL, '/path/app.apk', 'com.example.app');

    const calls = mockExec.mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls[0]![1]).toContain('am force-stop com.example.app');
    expect(calls[1]![1]).toEqual(['-s', SERIAL, 'uninstall', 'com.example.app']);
    expect(calls[2]![1]).toEqual(['-s', SERIAL, 'install', '-r', '/path/app.apk']);
    expect(calls[3]![1]).toContain('pm path com.example.app');
  });

  it('without packageName: wraps error with adb stderr', () => {
    const err = Object.assign(new Error('exit 1'), { stderr: 'INSTALL_FAILED_VERSION_DOWNGRADE' });
    mockExec.mockImplementation(() => { throw err; });
    expect(() => adb.install(SERIAL, '/path/app.apk')).toThrow('INSTALL_FAILED_VERSION_DOWNGRADE');
  });
});

// ── uninstall() ─────────────────────────────────────────────────────────────

describe('uninstall()', () => {
  it('returns true on Success', () => {
    mockExec.mockReturnValue('Success\n');
    expect(adb.uninstall(SERIAL, 'com.example.app')).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['-s', SERIAL, 'uninstall', 'com.example.app'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  it('returns false when package not installed (adb throws)', () => {
    mockExec.mockImplementation(() => { throw new Error('Unknown package'); });
    expect(adb.uninstall(SERIAL, 'com.example.app')).toBe(false);
  });
});

// ── pmClear() ───────────────────────────────────────────────────────────────

describe('pmClear()', () => {
  it('builds correct shell command', () => {
    mockExec.mockReturnValue('Success\n');
    adb.pmClear(SERIAL, 'com.example.app');
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['-s', SERIAL, 'shell', 'pm clear com.example.app'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });
});

// ── start() ─────────────────────────────────────────────────────────────────

describe('start()', () => {
  it('sends am start then waits for process to be alive', () => {
    mockExec
      .mockReturnValueOnce('')        // am start
      .mockReturnValueOnce('12345\n'); // pidof → process alive

    adb.start(SERIAL, 'com.example.app', '.MainActivity');

    expect(mockExec).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      ['-s', SERIAL, 'shell', 'am start -n com.example.app/.MainActivity'],
      expect.objectContaining({ encoding: 'utf8' })
    );
    expect(mockExec).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      ['-s', SERIAL, 'shell', 'pidof com.example.app'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });
});

// ── isInstalled() ────────────────────────────────────────────────────────────

describe('isInstalled()', () => {
  it('returns true when package listed', () => {
    mockExec.mockReturnValue('package:com.example.app\n');
    expect(adb.isInstalled(SERIAL, 'com.example.app')).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['-s', SERIAL, 'shell', 'pm list packages com.example.app'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  it('returns false when package not listed', () => {
    mockExec.mockReturnValue('\n');
    expect(adb.isInstalled(SERIAL, 'com.example.app')).toBe(false);
  });

  it('returns false when adb throws', () => {
    mockExec.mockImplementation(() => { throw new Error('device offline'); });
    expect(adb.isInstalled(SERIAL, 'com.example.app')).toBe(false);
  });
});

// ── adb binary resolution ────────────────────────────────────────────────────

describe('adb binary resolution', () => {
  it('uses ANDROID_HOME when set', () => {
    process.env['ANDROID_HOME'] = '/sdk';
    mockExec.mockReturnValue('List of devices attached\n');
    adb.devices();
    expect(mockExec).toHaveBeenCalledWith(
      '/sdk/platform-tools/adb',
      expect.any(Array),
      expect.any(Object)
    );
  });

  it('falls back to plain adb when no env vars set', () => {
    mockExec.mockReturnValue('List of devices attached\n');
    adb.devices();
    expect(mockExec).toHaveBeenCalledWith(
      'adb',
      expect.any(Array),
      expect.any(Object)
    );
  });
});
