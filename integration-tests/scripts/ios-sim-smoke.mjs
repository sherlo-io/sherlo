#!/usr/bin/env node
/**
 * Manual smoke test for IosSimulator harness.
 * Boots the global iOS simulator, installs the pre-built .app,
 * writes a file via get_app_container host-fs path, reads it back.
 *
 * Usage: node scripts/ios-sim-smoke.mjs
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTEGRATION_TESTS_DIR = path.resolve(__dirname, '..');

const SIM_NAME = 'sherlo-integration-tests-ios';
const HANDLE_FILE = path.join(INTEGRATION_TESTS_DIR, '.global-ios-simulator.json');
const APP_PATH = path.join(
  INTEGRATION_TESTS_DIR,
  'apps/integrated-app-bare-rn/ios/build/Build/Products/Release-iphonesimulator/BareRnHermesApp.app',
);
const BUNDLE_ID = 'org.reactjs.native.example.BareRnHermesApp';

function shell(cmd, timeoutMs = 120_000) {
  return execSync(cmd, { encoding: 'utf8', timeout: timeoutMs }).trim();
}

// ── simulator bootstrap ──────────────────────────────────────────────────────

function listAllDevices() {
  const raw = shell('xcrun simctl list devices --json', 30_000);
  const parsed = JSON.parse(raw);
  return Object.values(parsed.devices).flat();
}

function findByName(name) {
  return listAllDevices().find(d => d.name === name);
}

function pickRuntime() {
  const raw = shell('xcrun simctl list runtimes --json', 30_000);
  const parsed = JSON.parse(raw);
  const available = parsed.runtimes.filter(r => r.isAvailable && r.platform === 'iOS');
  if (!available.length) throw new Error('No available iOS runtimes');
  available.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  return available[0].identifier;
}

function pickDeviceType() {
  const raw = shell('xcrun simctl list devicetypes --json', 30_000);
  const parsed = JSON.parse(raw);
  for (const name of ['iPhone 16', 'iPhone 15', 'iPhone 14']) {
    const dt = parsed.devicetypes.find(d => d.name === name);
    if (dt) return dt.identifier;
  }
  throw new Error('No preferred iPhone device type found');
}

function ensureSimReady() {
  if (fs.existsSync(HANDLE_FILE)) {
    const { udid } = JSON.parse(fs.readFileSync(HANDLE_FILE, 'utf8'));
    console.log(`[smoke] Reusing simulator from handle file: ${udid}`);
    return udid;
  }

  const existing = findByName(SIM_NAME);
  let udid;

  if (existing) {
    udid = existing.udid;
    if (existing.state === 'Booted') {
      console.log(`[smoke] Existing simulator already booted: ${udid}`);
    } else if (existing.state === 'Shutdown') {
      console.log(`[smoke] Booting existing simulator: ${udid}`);
      shell(`xcrun simctl bootstatus "${udid}" -b`);
    } else {
      console.log(`[smoke] Deleting stale simulator in state "${existing.state}": ${udid}`);
      shell(`xcrun simctl delete "${udid}"`);
      udid = createAndBoot();
    }
  } else {
    udid = createAndBoot();
  }

  fs.writeFileSync(HANDLE_FILE, JSON.stringify({ udid }));
  return udid;
}

function createAndBoot() {
  const runtime = pickRuntime();
  const deviceType = pickDeviceType();
  console.log(`[smoke] Creating simulator "${SIM_NAME}" (${deviceType} / ${runtime})`);
  const udid = shell(`xcrun simctl create "${SIM_NAME}" "${deviceType}" "${runtime}"`);
  console.log(`[smoke] Booting ${udid} ...`);
  shell(`xcrun simctl bootstatus "${udid}" -b`);
  return udid;
}

// ── host-fs helpers via get_app_container ────────────────────────────────────

function container(udid, bundleId) {
  return shell(`xcrun simctl get_app_container "${udid}" "${bundleId}" data`);
}

function sherloDir(udid, bundleId) {
  const dir = path.join(container(udid, bundleId), 'Documents', 'sherlo');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(udid, bundleId, filename, contents) {
  const p = path.join(sherloDir(udid, bundleId), filename);
  fs.writeFileSync(p, contents, 'utf8');
}

function readFile(udid, bundleId, filename) {
  const p = path.join(sherloDir(udid, bundleId), filename);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

// ── main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('[smoke] Step 1: boot simulator');
  const udid = ensureSimReady();
  console.log(`[smoke] Simulator UDID: ${udid}`);

  console.log('[smoke] Step 2: install app');
  shell(`xcrun simctl install "${udid}" "${APP_PATH}"`);
  console.log(`[smoke] Installed: ${BUNDLE_ID}`);

  console.log('[smoke] Step 3: writeFile config.sherlo');
  const payload = '{"hello":"world"}';
  writeFile(udid, BUNDLE_ID, 'config.sherlo', payload);

  console.log('[smoke] Step 4: readFile config.sherlo');
  const result = readFile(udid, BUNDLE_ID, 'config.sherlo');
  console.log(`[smoke] Read back: ${result}`);

  if (result === payload) {
    console.log('[smoke] PASS: read-back matches written value');
  } else {
    console.error('[smoke] FAIL: mismatch');
    process.exit(1);
  }
})();
