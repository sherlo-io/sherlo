/**
 * SPIKE: the silent fallback to the file, in the two ways a keychain fails to answer.
 *
 *     missing  - the keyring binary cannot be loaded (unsupported platform, optional deps skipped).
 *     throws   - the binary loads, but the store throws (Linux with no Secret Service, a locked
 *                keychain over SSH). Stood in for here by an Entry whose every act throws the way
 *                the library does on a machine with no D-Bus.
 *
 * Run as: npx tsx spike-keychain/fallback.ts missing|throws
 * Nothing here touches the real keychain, and the file lives in a temporary folder.
 */
import fs from 'fs';
import Module from 'module';
import os from 'os';
import path from 'path';

const mode = process.argv[2];
const ADDRESS = 'https://spike-fallback.invalid/graphql';
const LOGIN = { token: 'sht_SPIKEFALLBACK_not_real', email: 'spike@example.com' };

class NoSecretServiceEntry {
  private fail(): never {
    throw new Error('Platform secure storage failure: org.freedesktop.DBus.Error.ServiceUnknown');
  }
  constructor(_service: string, _account: string, options?: { linux?: { store?: string } }) {
    if (options?.linux?.store === 'secret-service') this.fail();
  }
  getPassword() {
    return this.fail();
  }
  setPassword() {
    return this.fail();
  }
  deletePassword() {
    return this.fail();
  }
}

const loadModule = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (request, ...rest) {
  if (request === '@napi-rs/keyring') {
    if (mode === 'missing') throw new Error("Cannot find module '@napi-rs/keyring-linux-x64-gnu'");
    return { Entry: NoSecretServiceEntry };
  }
  return loadModule.call(this, request, ...rest);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { liveSavedLogins, savedLoginFilePath } = require('../src/seams/savedLogins');

const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-spike-fallback-'));
process.env.XDG_CONFIG_HOME = configHome;
try {
  liveSavedLogins.save(ADDRESS, LOGIN);
  console.log(`[${mode}] save fell back to the file:`, fs.existsSync(savedLoginFilePath()), 'mode', (fs.statSync(savedLoginFilePath()).mode % 0o1000).toString(8));
  console.log(`[${mode}] read:`, JSON.stringify(liveSavedLogins.read(ADDRESS)));
  liveSavedLogins.remove(ADDRESS);
  console.log(`[${mode}] read after remove:`, liveSavedLogins.read(ADDRESS));
} finally {
  fs.rmSync(configHome, { recursive: true, force: true });
}
