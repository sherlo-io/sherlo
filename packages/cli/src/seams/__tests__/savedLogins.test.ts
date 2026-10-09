/**
 * THE SAVED-LOGIN SEAM'S LIVE HALF - the real file (sherlo / Logging in from the terminal, "Where is
 * the login kept?").
 *
 * Every case points XDG_CONFIG_HOME at a fresh temporary folder, so the file these cases write is
 * never the one in this machine's home.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveSavedLogins, savedLoginFilePath } from '../savedLogins';

const TEST_STAGE = 'https://api.test.sherlo.io/graphql';
const PROD_STAGE = 'https://api.sherlo.io/graphql';

const ANNA = { token: 'sht_annatoken0000000000000000000000', email: 'anna@example.com' };
const BOB = { token: 'sht_bobtoken00000000000000000000000', email: 'bob@example.com' };

let configHome: string;

beforeEach(() => {
  configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-saved-logins-'));
  vi.stubEnv('XDG_CONFIG_HOME', configHome);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(configHome, { recursive: true, force: true });
});

describe('the saved-login file', () => {
  it('keeps the saved-login file under XDG_CONFIG_HOME when it is set', () => {
    const expectedFile = path.join(configHome, 'sherlo', 'credentials.json');

    liveSavedLogins.save(PROD_STAGE, ANNA);

    expect(savedLoginFilePath()).toBe(expectedFile);
    expect(fs.existsSync(expectedFile)).toBe(true);

    // And with it unset, the file is under ~/.config. Only the path is read here: nothing is
    // written into this machine's home.
    vi.stubEnv('XDG_CONFIG_HOME', '');
    expect(savedLoginFilePath()).toBe(
      path.join(os.homedir(), '.config', 'sherlo', 'credentials.json')
    );
  });

  it('writes the saved-login file readable and writable by its owner alone', () => {
    liveSavedLogins.save(PROD_STAGE, ANNA);
    expect(permissionsOf(savedLoginFilePath())).toBe(0o600);
    expect(permissionsOf(path.dirname(savedLoginFilePath()))).toBe(0o700);

    // A file somebody loosened is narrowed again by the next write.
    fs.chmodSync(savedLoginFilePath(), 0o644);
    liveSavedLogins.save(TEST_STAGE, BOB);
    expect(permissionsOf(savedLoginFilePath())).toBe(0o600);

    // And so is one a removal rewrites.
    fs.chmodSync(savedLoginFilePath(), 0o644);
    liveSavedLogins.remove(TEST_STAGE);
    expect(permissionsOf(savedLoginFilePath())).toBe(0o600);
  });

  it('replaces a loosened saved-login file with an owner-only one, and never writes a token into the loosened file', () => {
    liveSavedLogins.save(PROD_STAGE, ANNA);
    fs.chmodSync(savedLoginFilePath(), 0o644);

    // Hold the loosened file open: whatever is ever written INTO it shows up through this handle.
    const loosenedFile = fs.openSync(savedLoginFilePath(), 'r');
    try {
      liveSavedLogins.save(TEST_STAGE, BOB);

      const loosenedFileContent = fs.readFileSync(loosenedFile, 'utf8');
      expect(loosenedFileContent).not.toContain(BOB.token);
    } finally {
      fs.closeSync(loosenedFile);
    }

    // The file at the path now is a new one, owner-only, holding both logins.
    expect(permissionsOf(savedLoginFilePath())).toBe(0o600);
    expect(liveSavedLogins.read(TEST_STAGE)).toEqual(BOB);
    expect(liveSavedLogins.read(PROD_STAGE)).toEqual(ANNA);
    // And no half-written file is left beside it.
    expect(fs.readdirSync(path.dirname(savedLoginFilePath()))).toEqual(['credentials.json']);
  });

  it('saves the login under the service address it was made against', () => {
    liveSavedLogins.save(PROD_STAGE, ANNA);

    const file = JSON.parse(fs.readFileSync(savedLoginFilePath(), 'utf8'));

    expect(Object.keys(file)).toEqual([PROD_STAGE]);
    expect(file[PROD_STAGE]).toMatchObject(ANNA);
    expect(Number.isNaN(Date.parse(file[PROD_STAGE].savedAt))).toBe(false);
    expect(liveSavedLogins.read(PROD_STAGE)).toEqual(ANNA);
  });

  it('spends no login saved under another service address', () => {
    // No file yet: no login under any address.
    expect(liveSavedLogins.read(PROD_STAGE)).toBeUndefined();

    liveSavedLogins.save(PROD_STAGE, ANNA);

    expect(liveSavedLogins.read(TEST_STAGE)).toBeUndefined();

    // Saving and deleting under one address leaves the other's login as it was.
    liveSavedLogins.save(TEST_STAGE, BOB);
    liveSavedLogins.remove(TEST_STAGE);

    expect(liveSavedLogins.read(TEST_STAGE)).toBeUndefined();
    expect(liveSavedLogins.read(PROD_STAGE)).toEqual(ANNA);
  });
});

/** A file's permission bits, written as `0o600` is: the last three octal digits of its mode. */
function permissionsOf(filePath: string): number {
  return fs.statSync(filePath).mode % 0o1000;
}
