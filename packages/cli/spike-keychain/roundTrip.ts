/**
 * SPIKE: a real save / read / remove round trip through the SavedLogins seam against this Mac's login
 * keychain, plus the file fallback, and the macOS `security` tool's view of the entry it left.
 *
 * The file side points XDG_CONFIG_HOME at a fresh temporary folder, so nothing in ~/.config is touched.
 * The service address and token are made up; the entry is deleted at the end whatever happens.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileSavedLogins, liveSavedLogins, savedLoginFilePath } from '../src/seams/savedLogins';

const ADDRESS = 'https://spike-keychain.invalid/graphql';
const LOGIN = { token: 'sht_SPIKEKEYCHAIN_not_a_real_token_000', email: 'spike@example.com' };

const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-spike-keychain-'));
process.env.XDG_CONFIG_HOME = configHome;

function timed<T>(label: string, act: () => T): T {
  const started = process.hrtime.bigint();
  const result = act();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`${label.padEnd(44)} ${ms.toFixed(1).padStart(7)} ms ->`, JSON.stringify(result));
  return result;
}

/** What `security` says about the entry: its attributes only (no -w, no -g: the secret is not printed). */
function securityView(): string {
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'sherlo', '-a', ADDRESS], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\n')
      .filter((line) => /keychain:|class:|"acct"|"svce"|"cdat"/.test(line))
      .join(' | ');
  } catch (error) {
    return `not found (${(error as { status?: number }).status})`;
  }
}

try {
  console.log('node', process.execPath, process.version, process.arch);

  timed('keychain: read before save', () => liveSavedLogins.read(ADDRESS));
  timed('keychain: save', () => liveSavedLogins.save(ADDRESS, LOGIN));
  console.log('security sees the entry:', securityView());
  timed('keychain: read after save', () => liveSavedLogins.read(ADDRESS));
  console.log('file written by a keychain save?', fs.existsSync(savedLoginFilePath()));

  // A login an older run kept in the file is still read, and the next save moves it into the keychain.
  timed('remove (both stores)', () => liveSavedLogins.remove(ADDRESS));
  timed('file-only save (an old login)', () => fileSavedLogins.save(ADDRESS, LOGIN));
  timed('read finds the file login', () => liveSavedLogins.read(ADDRESS));
  timed('save again (moves it to keychain)', () => liveSavedLogins.save(ADDRESS, LOGIN));
  console.log('file entry left after the move:', fileSavedLogins.read(ADDRESS) ?? 'none');

  // SHERLO_SAVED_LOGIN_STORE=file: the keychain is never touched.
  timed('remove (both stores)', () => liveSavedLogins.remove(ADDRESS));
  process.env.SHERLO_SAVED_LOGIN_STORE = 'file';
  timed('forced file: save', () => liveSavedLogins.save(ADDRESS, LOGIN));
  console.log('security sees an entry after a forced-file save:', securityView());
  console.log('file mode:', (fs.statSync(savedLoginFilePath()).mode % 0o1000).toString(8));
  timed('forced file: read', () => liveSavedLogins.read(ADDRESS));
  timed('forced file: remove', () => liveSavedLogins.remove(ADDRESS));
  delete process.env.SHERLO_SAVED_LOGIN_STORE;

  timed('read after everything removed', () => liveSavedLogins.read(ADDRESS));
  console.log('security sees the entry at the end:', securityView());
} finally {
  delete process.env.SHERLO_SAVED_LOGIN_STORE;
  liveSavedLogins.remove(ADDRESS);
  fs.rmSync(configHome, { recursive: true, force: true });
}
