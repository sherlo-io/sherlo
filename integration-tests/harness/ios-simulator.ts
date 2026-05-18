import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IosSimulator } from './ios-device.js';

export const SIM_NAME = 'sherlo-integration-tests-ios';

interface SimDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
}

interface SimRuntime {
  identifier: string;
  version: string;
  isAvailable: boolean;
  platform: string;
}

interface SimDeviceType {
  identifier: string;
  name: string;
}

function simExec(cmd: string, timeoutMs = 120_000): string {
  return execSync(cmd, { encoding: 'utf8', timeout: timeoutMs }).trim();
}

function listAllDevices(): SimDevice[] {
  const raw = execSync('xcrun simctl list devices --json', { encoding: 'utf8', timeout: 30_000 });
  const parsed = JSON.parse(raw) as { devices: Record<string, SimDevice[]> };
  return Object.values(parsed.devices).flat();
}

function findSimulatorByName(name: string): SimDevice | undefined {
  return listAllDevices().find(d => d.name === name);
}

function pickRuntime(): string {
  const raw = execSync('xcrun simctl list runtimes --json', { encoding: 'utf8', timeout: 30_000 });
  const parsed = JSON.parse(raw) as { runtimes: SimRuntime[] };
  const available = parsed.runtimes.filter(r => r.isAvailable && r.platform === 'iOS');
  if (available.length === 0) {
    throw new Error('No available iOS runtimes found. Install an iOS simulator runtime via Xcode.');
  }
  available.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  return available[0]!.identifier;
}

function pickDeviceType(): string {
  const raw = execSync('xcrun simctl list devicetypes --json', { encoding: 'utf8', timeout: 30_000 });
  const parsed = JSON.parse(raw) as { devicetypes: SimDeviceType[] };
  const preferred = ['iPhone 16', 'iPhone 15', 'iPhone 14'];
  for (const name of preferred) {
    const dt = parsed.devicetypes.find(d => d.name === name);
    if (dt) return dt.identifier;
  }
  throw new Error(
    `No preferred device type found (tried: ${preferred.join(', ')}). ` +
    'Install iPhone simulator support via Xcode.',
  );
}

function ensureSimulatorReadyAndGetUdid(): string {
  const existing = findSimulatorByName(SIM_NAME);

  if (existing) {
    if (existing.state === 'Booted') {
      console.log(`iOS simulator: reusing booted "${SIM_NAME}" (${existing.udid})`);
      return existing.udid;
    }
    if (existing.state === 'Shutdown') {
      console.log(`iOS simulator: booting existing "${SIM_NAME}" (${existing.udid})`);
      simExec(`xcrun simctl bootstatus "${existing.udid}" -b`);
      return existing.udid;
    }
    // Unexpected state (e.g. "Shutting Down"): delete and recreate
    console.log(`iOS simulator: deleting stale "${SIM_NAME}" in state "${existing.state}" (${existing.udid})`);
    simExec(`xcrun simctl delete "${existing.udid}"`);
  }

  const runtime = pickRuntime();
  const deviceType = pickDeviceType();
  console.log(`iOS simulator: creating "${SIM_NAME}" (${deviceType} / ${runtime})`);
  const udid = simExec(`xcrun simctl create "${SIM_NAME}" "${deviceType}" "${runtime}"`);
  console.log(`iOS simulator: booting "${SIM_NAME}" (${udid})`);
  simExec(`xcrun simctl bootstatus "${udid}" -b`);
  return udid;
}

/**
 * Return the global iOS simulator, creating and booting it on first call.
 * Subsequent calls read the UDID from `.global-ios-simulator.json`.
 */
export function getGlobalIosSimulator(): IosSimulator {
  const handlePath = path.join(__dirname, '..', '.global-ios-simulator.json');

  if (fs.existsSync(handlePath)) {
    const { udid } = JSON.parse(fs.readFileSync(handlePath, 'utf8')) as { udid: string };
    return new IosSimulator(udid);
  }

  const udid = ensureSimulatorReadyAndGetUdid();
  fs.writeFileSync(handlePath, JSON.stringify({ udid }));
  console.log(`iOS simulator: ready - ${udid}`);
  return new IosSimulator(udid);
}

/** Shutdown the global iOS simulator and remove its handle file. */
export function shutdownGlobalIosSimulator(): void {
  const handlePath = path.join(__dirname, '..', '.global-ios-simulator.json');
  if (!fs.existsSync(handlePath)) return;

  const { udid } = JSON.parse(fs.readFileSync(handlePath, 'utf8')) as { udid: string };
  try {
    execSync(`xcrun simctl shutdown "${udid}"`, { encoding: 'utf8', timeout: 30_000 });
  } catch {
    // best-effort
  }
  try { fs.unlinkSync(handlePath); } catch { /* best-effort */ }
}
