import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DeviceSerial } from './adb.js';
import { devices, shell } from './adb.js';
import { AndroidDevice } from './android-device.js';

export interface ManagedEmulator {
  serial: DeviceSerial;
  shutdown(): Promise<void>;
}

/**
 * AVD specifications:
 *  - name: 'sherlo-sdk-tests'
 *  - device profile: pixel_6
 *  - system image: system-images;android-34;default;<arm64-v8a|x86_64> (arch-detected at runtime)
 *  - API: 34
 */
// Uses the same 'default' variant + arm64-v8a convention as sherlo-tester
// (e2e/helpers/android-emulator.ts) so users who have already installed
// the image for tester can reuse it here without downloading a second image.
export const AVD_NAME = 'sherlo-sdk-tests';

// Resolve a system image that matches host arch and aligns with sherlo-tester's setup.
// On macOS arm64 (Apple Silicon): system-images;android-34;default;arm64-v8a
// On Linux/Intel: system-images;android-34;default;x86_64
function resolveSystemImage(): string {
  const arch = process.arch === 'arm64' ? 'arm64-v8a' : 'x86_64';
  return `system-images;android-34;default;${arch}`;
}
export const SYSTEM_IMAGE = resolveSystemImage();

const DEVICE_PROFILE = 'pixel_6';
const BOOT_POLL_INTERVAL_MS = 2_000;
const STABILITY_SLEEP_MS = 3_000;
const DEFAULT_BOOT_TIMEOUT_MS = 360_000;

function resolveAndroidHome(): string {
  const h = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'];
  if (!h) throw new Error('ANDROID_HOME is not set. Set ANDROID_HOME to your Android SDK path.');
  return h;
}

function emulatorBinary(): string {
  const home = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'];
  return home ? path.join(home, 'emulator', 'emulator') : 'emulator';
}

function avdManagerBinary(): string {
  const home = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'];
  if (!home) return 'avdmanager';
  const latest = path.join(home, 'cmdline-tools', 'latest', 'bin', 'avdmanager');
  if (fs.existsSync(latest)) return latest;
  const tools = path.join(home, 'tools', 'bin', 'avdmanager');
  if (fs.existsSync(tools)) return tools;
  return 'avdmanager';
}

function adbBinary(): string {
  const home = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'];
  return home ? path.join(home, 'platform-tools', 'adb') : 'adb';
}

/** Returns true if an AVD with AVD_NAME already exists. */
export function avdExists(): boolean {
  const iniPath = path.join(os.homedir(), '.android', 'avd', `${AVD_NAME}.ini`);
  return fs.existsSync(iniPath);
}

/**
 * Create the AVD if it doesn't exist. Uses `avdmanager create avd ...`.
 * Throws on failure. Idempotent.
 */
export function ensureAvdExists(): void {
  if (avdExists()) return;

  const androidHome = resolveAndroidHome();
  const [, api, variant, arch] = SYSTEM_IMAGE.split(';');
  const imageDir = path.join(androidHome, 'system-images', api!, variant!, arch!);
  if (!fs.existsSync(imageDir)) {
    throw new Error(
      `System image not installed: ${SYSTEM_IMAGE}\n` +
      `Install via Android SDK manager:\n` +
      `  sdkmanager '${SYSTEM_IMAGE}'`
    );
  }

  execFileSync(
    avdManagerBinary(),
    [
      'create', 'avd',
      '--name', AVD_NAME,
      '--package', SYSTEM_IMAGE,
      '--device', DEVICE_PROFILE,
      '--force',
    ],
    { encoding: 'utf8', stdio: 'pipe' }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function findRunningEmulator(): DeviceSerial | undefined {
  try {
    return devices().find((d) => d.serial.startsWith('emulator-') && d.state === 'device')?.serial;
  } catch {
    return undefined;
  }
}

async function waitForBoot(serial: DeviceSerial, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const booted = shell(serial, 'getprop sys.boot_completed', { timeout: 5_000 });
      if (booted === '1') {
        await sleep(STABILITY_SLEEP_MS);
        return;
      }
    } catch {
      // device not yet visible in adb - keep polling
    }
    await sleep(BOOT_POLL_INTERVAL_MS);
  }
  throw new Error(`Emulator ${serial} did not finish booting within ${timeoutMs}ms`);
}

async function waitForDeviceGone(serial: DeviceSerial, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (!devices().find(d => d.serial === serial)) return;
    } catch {
      return; // adb error likely means device is gone
    }
    await sleep(500);
  }
  // best-effort: don't throw if the device lingers
}

/** Restart the adb daemon without touching emulator processes. Fixes "device offline" states. */
function softAdbReset(): void {
  const adb = adbBinary();
  try {
    execFileSync(adb, ['kill-server'], { encoding: 'utf8', stdio: 'pipe', timeout: 10_000 });
  } catch {
    // best-effort
  }
  try {
    execFileSync(adb, ['start-server'], { encoding: 'utf8', stdio: 'pipe', timeout: 15_000 });
  } catch {
    // best-effort
  }
  console.log('emulator: soft adb reset');
}

/** SIGKILL all qemu/emulator processes. Used when an existing emulator is a zombie. */
function killEmulatorProcesses(): void {
  for (const name of ['qemu-system-aarch64', 'qemu-system-x86_64', 'emulator']) {
    try {
      execFileSync('pkill', ['-9', name], { encoding: 'utf8', stdio: 'pipe' });
    } catch {
      // process not found - that's fine
    }
  }
}

/**
 * Boot the AVD if not already running. Wait for sys.boot_completed == 1 plus
 * a short stability sleep. Resolves with a ManagedEmulator handle.
 *
 * Safety prelude runs before every boot attempt:
 *  1. Soft adb reset (kill-server + start-server) - always.
 *  2. Health-check any existing emulator; hard-kill it if unresponsive.
 *
 * Headless flags: -no-snapshot-load -no-audio -no-window  (configurable via opts.headed=true).
 */
export async function bootEmulator(
  opts: { headed?: boolean; bootTimeoutMs?: number } = {}
): Promise<ManagedEmulator> {
  const bootTimeoutMs = opts.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS;
  const deadline = Date.now() + bootTimeoutMs;

  // Step 1: Soft adb reset - always run, cheap, fixes "device offline" states.
  softAdbReset();

  // Step 2: Existing-emulator health check.
  const existing = findRunningEmulator();
  if (existing) {
    let healthy = false;
    try {
      const result = shell(existing, 'getprop sys.boot_completed', { timeout: 5_000 });
      healthy = result === '1';
    } catch {
      // timed out or adb error - treat as unhealthy
    }

    if (healthy) {
      const remaining = deadline - Date.now();
      await waitForBoot(existing, remaining > 0 ? remaining : bootTimeoutMs);
      return makeHandle(existing);
    }

    // Zombie emulator: hard-kill and fall through to a fresh boot.
    killEmulatorProcesses();
    console.log('emulator: hard reset (existing was unhealthy)');
    await sleep(2_000);
  }

  // Step 3: Fresh AVD launch.
  console.log('emulator: clean boot');
  ensureAvdExists();

  const headlessFlags = opts.headed
    ? []
    : ['-no-snapshot-load', '-no-audio', '-no-window'];

  const child = spawn(emulatorBinary(), ['-avd', AVD_NAME, ...headlessFlags], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Poll until a new emulator-XXXX serial appears in adb devices
  let serial: DeviceSerial | undefined;
  while (Date.now() < deadline) {
    serial = findRunningEmulator();
    if (serial) break;
    await sleep(BOOT_POLL_INTERVAL_MS);
  }
  if (!serial) {
    throw new Error(`No emulator appeared in adb devices within ${bootTimeoutMs}ms`);
  }

  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`Emulator boot timed out (${bootTimeoutMs}ms) - device appeared but boot_completed not checked`);
  }
  await waitForBoot(serial, remaining);

  return makeHandle(serial);
}

function makeHandle(serial: DeviceSerial): ManagedEmulator {
  return {
    serial,
    shutdown: async () => {
      try {
        execFileSync(adbBinary(), ['-s', serial, 'emu', 'kill'], {
          encoding: 'utf8',
          timeout: 10_000,
        });
      } catch {
        // best-effort; the emulator may have already exited
      }
      await waitForDeviceGone(serial);
    },
  };
}

export function getGlobalEmulator(): AndroidDevice {
  const handlePath = path.join(__dirname, '..', '.global-emulator.json');
  const { serial } = JSON.parse(fs.readFileSync(handlePath, 'utf8')) as { serial: DeviceSerial };
  return new AndroidDevice(serial);
}
