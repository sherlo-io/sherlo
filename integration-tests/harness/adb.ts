import { execFileSync } from 'node:child_process';

export type DeviceSerial = string;

export interface AdbDevice {
  serial: DeviceSerial;
  state: 'device' | 'offline' | 'unauthorized' | 'unknown';
}

const DEFAULT_TIMEOUT = 30_000;
const INSTALL_TIMEOUT = 180_000;
const INSTALL_SETTLE_TIMEOUT_MS = 10_000;
const PROCESS_ALIVE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 300;
const APP_START_MAX_ATTEMPTS = 2;

export function adbBinary(): string {
  const home = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'];
  return home ? `${home}/platform-tools/adb` : 'adb';
}

function run(args: string[], timeout = DEFAULT_TIMEOUT): string {
  try {
    return execFileSync(adbBinary(), args, { timeout, encoding: 'utf8' });
  } catch (err: unknown) {
    const stderr =
      err instanceof Error && 'stderr' in err ? String((err as NodeJS.ErrnoException & { stderr: unknown }).stderr) : '';
    const msg = stderr.trim() || (err instanceof Error ? err.message : String(err));
    throw new Error(`adb ${args.join(' ')} failed: ${msg}`);
  }
}

function serialArgs(serial: DeviceSerial): string[] {
  if (!serial) throw new Error('serial must be a non-empty string');
  return ['-s', serial];
}

// Synchronous sleep using Atomics.wait - valid on Node.js main thread.
function syncSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Poll `pm path <pkg>` until the package manager has registered the new APK.
function waitForPackageRegistered(serial: DeviceSerial, packageName: string, timeoutMs = INSTALL_SETTLE_TIMEOUT_MS): void {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const out = run([...serialArgs(serial), 'shell', `pm path ${packageName}`]);
      if (out.includes(packageName)) return;
    } catch { /* package not registered yet */ }
    if (Date.now() < deadline) syncSleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Package ${packageName} was not registered by the package manager within ${timeoutMs}ms`);
}

// Poll `pidof <pkg>` until the process appears. Throws with a logcat snippet on timeout.
function waitForProcessAlive(serial: DeviceSerial, packageName: string, timeoutMs = PROCESS_ALIVE_TIMEOUT_MS): void {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pid = pidOf(serial, packageName);
    if (pid) return;
    if (Date.now() < deadline) syncSleep(POLL_INTERVAL_MS);
  }

  let logcatSnippet = '(unavailable)';
  try {
    const raw = execFileSync(adbBinary(), ['-s', serial, 'logcat', '-d', '-v', 'brief'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    logcatSnippet = raw.split('\n').filter(l => l.trim()).slice(-100).join('\n') || '(none)';
  } catch { /* best-effort */ }

  throw new Error(
    `App ${packageName} did not start (no pid found) within ${timeoutMs}ms.\n` +
    `Last 100 logcat lines:\n${logcatSnippet}`,
  );
}

export function devices(): AdbDevice[] {
  const output = run(['devices', '-l']);
  const lines = output.split('\n').slice(1); // drop "List of devices attached" header
  const result: AdbDevice[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const serial = parts[0]!;
    const rawState = parts[1]!;
    const state: AdbDevice['state'] =
      rawState === 'device' || rawState === 'offline' || rawState === 'unauthorized'
        ? rawState
        : 'unknown';
    result.push({ serial, state });
  }
  return result;
}

export function shell(serial: DeviceSerial, cmd: string, opts?: { timeout?: number }): string {
  if (!cmd) throw new Error('cmd must be a non-empty string');
  const output = run([...serialArgs(serial), 'shell', cmd], opts?.timeout);
  return output.trim();
}

export function push(serial: DeviceSerial, src: string, dst: string): void {
  if (!src) throw new Error('src must be a non-empty string');
  if (!dst) throw new Error('dst must be a non-empty string');
  run([...serialArgs(serial), 'push', src, dst]);
}

export function pull(serial: DeviceSerial, src: string, dst: string): void {
  if (!src) throw new Error('src must be a non-empty string');
  if (!dst) throw new Error('dst must be a non-empty string');
  run([...serialArgs(serial), 'pull', src, dst]);
}

/**
 * Force-stop an app before uninstall to release any file locks.
 * Errors are silently swallowed - best-effort.
 */
export function forceStop(serial: DeviceSerial, packageName: string): void {
  if (!packageName) throw new Error('packageName must be a non-empty string');
  try {
    run([...serialArgs(serial), 'shell', `am force-stop ${packageName}`]);
  } catch { /* best-effort */ }
}

/**
 * Return the running PID for packageName, or an empty string if not running.
 */
export function pidOf(serial: DeviceSerial, packageName: string): string {
  if (!packageName) throw new Error('packageName must be a non-empty string');
  try {
    return run([...serialArgs(serial), 'shell', `pidof ${packageName}`]).trim();
  } catch {
    return '';
  }
}

/**
 * Install an APK. When packageName is supplied, performs a clean install:
 *   1. force-stop (releases file locks from prior run)
 *   2. uninstall (wipes data dir, avoids stale sherlo files)
 *   3. adb install -r
 *   4. wait for pm path to confirm the package manager has registered the new APK
 *
 * Without packageName the old `adb install -r` behaviour is preserved.
 */
export function install(serial: DeviceSerial, apkPath: string, packageName?: string): void {
  if (!apkPath) throw new Error('apkPath must be a non-empty string');
  if (packageName) {
    forceStop(serial, packageName);
    uninstall(serial, packageName);
  }
  run([...serialArgs(serial), 'install', '-r', apkPath], INSTALL_TIMEOUT);
  if (packageName) {
    waitForPackageRegistered(serial, packageName);
  }
}

export function uninstall(serial: DeviceSerial, packageName: string): boolean {
  if (!packageName) throw new Error('packageName must be a non-empty string');
  try {
    const output = run([...serialArgs(serial), 'uninstall', packageName]);
    return output.includes('Success');
  } catch {
    return false;
  }
}

export function pmClear(serial: DeviceSerial, packageName: string): void {
  if (!packageName) throw new Error('packageName must be a non-empty string');
  run([...serialArgs(serial), 'shell', `pm clear ${packageName}`]);
}

/**
 * Launch an activity and wait up to 30 s for the process to appear in pidof.
 * Throws with a logcat snippet if the app crashes before its process registers.
 */
export function start(serial: DeviceSerial, packageName: string, activity: string): void {
  if (!packageName) throw new Error('packageName must be a non-empty string');
  if (!activity) throw new Error('activity must be a non-empty string');

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= APP_START_MAX_ATTEMPTS; attempt++) {
    try {
      run([...serialArgs(serial), 'shell', `am start -n ${packageName}/${activity}`]);
      waitForProcessAlive(serial, packageName);
      if (attempt > 1) {
        console.log(`adb: app start succeeded on attempt ${attempt}/${APP_START_MAX_ATTEMPTS}`);
      }
      return;
    } catch (err) {
      lastError = err as Error;
      if (attempt < APP_START_MAX_ATTEMPTS) {
        console.log(`adb: app start attempt ${attempt}/${APP_START_MAX_ATTEMPTS} failed, force-stopping and retrying`);
        try {
          run([...serialArgs(serial), 'shell', `am force-stop ${packageName}`]);
        } catch { /* best-effort */ }
      }
    }
  }
  throw lastError;
}

export function isInstalled(serial: DeviceSerial, packageName: string): boolean {
  if (!packageName) throw new Error('packageName must be a non-empty string');
  try {
    const output = run([...serialArgs(serial), 'shell', `pm list packages ${packageName}`]);
    return output.includes(`package:${packageName}`);
  } catch {
    return false;
  }
}
