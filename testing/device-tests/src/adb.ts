import { execFileSync } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 30_000;
const INSTALL_TIMEOUT_MS = 180_000;
const PACKAGE_REGISTERED_TIMEOUT_MS = 10_000;
const PROCESS_ALIVE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 300;

/** The adb from ANDROID_HOME / ANDROID_SDK_ROOT, falling back to whatever is on PATH. */
export function adbBinary(): string {
  const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  return sdkRoot ? `${sdkRoot}/platform-tools/adb` : 'adb';
}

function runAdb(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): string {
  try {
    return execFileSync(adbBinary(), args, { timeout: timeoutMs, encoding: 'utf8' });
  } catch (error: unknown) {
    const stderr =
      error instanceof Error && 'stderr' in error
        ? String((error as Error & { stderr: unknown }).stderr ?? '')
        : '';
    const detail = stderr.trim() || (error instanceof Error ? error.message : String(error));
    throw new Error(`adb ${args.join(' ')} failed: ${detail}`);
  }
}

// Atomics.wait is a real synchronous sleep on the Node main thread, which the
// polls below want - they interleave with nothing.
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * The serial of the one device this run should drive.
 *
 * This suite DRIVES a device; it never boots one - CI's emulator action does
 * that, and locally you already have one running. Which makes "no device" the
 * likeliest way to meet this suite, so each way of getting it wrong says what
 * to do about it here, at the top, rather than surfacing later as a hung
 * install or a bare "device not found" out of a shell.
 *
 * It also refuses to guess between several: picking one silently would leave
 * whatever the others would have caught invisible.
 */
export function soleReadyDeviceSerial(): string {
  let listing: string;
  try {
    listing = runAdb(['devices']);
  } catch (error) {
    throw new Error(
      `could not run adb (${adbBinary()}). Install the Android SDK platform-tools and set ` +
        'ANDROID_HOME (or ANDROID_SDK_ROOT), or run this suite through the ' +
        `test:device-sanity workflow, which provides both.\n${
          error instanceof Error ? error.message : String(error)
        }`
    );
  }

  const ready = listing
    .split('\n')
    .slice(1) // drop the "List of devices attached" header
    .map((line) => line.trim().split(/\s+/))
    .filter((columns) => columns.length >= 2 && columns[1] === 'device')
    .map((columns) => columns[0]!);

  if (ready.length === 0) {
    throw new Error(
      'no running Android device. This suite drives a device, it never boots one: start an ' +
        'emulator (or attach a device with USB debugging enabled) so that `adb devices` ' +
        'lists exactly one ready device, or run the suite through the test:device-sanity ' +
        `workflow, which boots one for you.\nadb devices said:\n${listing}`
    );
  }
  if (ready.length > 1) {
    throw new Error(
      `${ready.length} ready Android devices (${ready.join(', ')}) - this suite will not ` +
        'guess which one you meant, because the choice decides what the run proves. Leave ' +
        `exactly one connected.\nadb devices said:\n${listing}`
    );
  }
  return ready[0]!;
}

export function shell(serial: string, command: string, timeoutMs?: number): string {
  return runAdb(['-s', serial, 'shell', command], timeoutMs).trim();
}

export function forceStop(serial: string, packageName: string): void {
  try {
    runAdb(['-s', serial, 'shell', `am force-stop ${packageName}`]);
  } catch {
    // Best-effort: nothing to stop is the same outcome as stopping it.
  }
}

function runningPid(serial: string, packageName: string): string {
  try {
    return runAdb(['-s', serial, 'shell', `pidof ${packageName}`]).trim();
  } catch {
    return '';
  }
}

/**
 * Clean install: stop and uninstall first so no state from a previous run
 * survives in the app's data directory, then wait for the package manager to
 * register the new APK - `adb install` returns before `am start` can find it.
 */
export function installFresh(serial: string, apkPath: string, packageName: string): void {
  forceStop(serial, packageName);
  try {
    runAdb(['-s', serial, 'uninstall', packageName]);
  } catch {
    // Not installed yet - nothing to remove.
  }

  runAdb(['-s', serial, 'install', '-r', apkPath], INSTALL_TIMEOUT_MS);

  const deadline = Date.now() + PACKAGE_REGISTERED_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if (runAdb(['-s', serial, 'shell', `pm path ${packageName}`]).includes(packageName)) return;
    } catch {
      // Not registered yet.
    }
    sleepSync(POLL_INTERVAL_MS);
  }
  throw new Error(
    `the package manager never registered ${packageName} within ${PACKAGE_REGISTERED_TIMEOUT_MS}ms`
  );
}

/** Launches an activity and waits for its process to appear, so a crash-on-launch fails here. */
export function launch(serial: string, packageName: string, activity: string): void {
  runAdb(['-s', serial, 'shell', `am start -n ${packageName}/${activity}`]);

  const deadline = Date.now() + PROCESS_ALIVE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (runningPid(serial, packageName)) return;
    sleepSync(POLL_INTERVAL_MS);
  }
  throw new Error(
    `${packageName} did not start (no pid) within ${PROCESS_ALIVE_TIMEOUT_MS}ms - it most ` +
      'likely crashed during launch; the captured log has the reason'
  );
}

/**
 * The current screen as uiautomator's XML view hierarchy.
 *
 * `uiautomator dump` exits non-zero when the accessibility service is busy,
 * which is common right after an app launch, so it is retried. The dump is
 * read back with `exec-out cat` rather than pulled to a temp file - one fewer
 * artifact to create and clean up.
 */
export function dumpViewHierarchy(serial: string): string {
  const remotePath = `/sdcard/sherlo-window-dump-${Date.now()}.xml`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      runAdb(['-s', serial, 'shell', `uiautomator dump ${remotePath}`], 15_000);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      sleepSync(3_000);
    }
  }
  if (lastError) throw lastError;

  try {
    return runAdb(['-s', serial, 'exec-out', `cat ${remotePath}`], 15_000);
  } finally {
    try {
      runAdb(['-s', serial, 'shell', `rm -f ${remotePath}`], 10_000);
    } catch {
      // Best-effort cleanup of a file on a throwaway emulator.
    }
  }
}

export function tap(serial: string, x: number, y: number): void {
  runAdb(['-s', serial, 'shell', `input tap ${x} ${y}`], 10_000);
}
