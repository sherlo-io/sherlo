/**
 * THE SAVED-LOGIN SEAM'S KEYCHAIN (sherlo / Where the login is kept).
 *
 * No case here touches this machine's keychain: the store is handed a fake keychain, and the macOS
 * keychain is handed a fake `security`. The file side points XDG_CONFIG_HOME at a fresh temporary
 * folder, so the file these cases write is never the one in this machine's home.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Keychain,
  keyringKeychain,
  macOsKeychain,
  performKeyringCall,
  type PendingLogin,
  runKeyringCallInChildProcess,
  savedLoginFilePath,
  savedLoginsKeptIn,
  type SecurityResult,
} from '../savedLogins';
import { installSurroundings, type Surroundings } from '../surroundings';

const PROD_STAGE = 'https://api.sherlo.io/graphql';

const ANNA = { token: 'sht_annatoken0000000000000000000000', email: 'anna@example.com' };
const BOB = { token: 'sht_bobtoken00000000000000000000000', email: 'bob@example.com' };

let configHome: string;

beforeEach(() => {
  configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-saved-logins-keychain-'));
  vi.stubEnv('XDG_CONFIG_HOME', configHome);
  // The suite keeps every test's logins in the file; these cases are the keychain's, so they lift
  // that, and hand the store a fake keychain instead.
  vi.stubEnv('SHERLO_SAVED_LOGIN_STORE', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(configHome, { recursive: true, force: true });
});

describe('the saved login in the keychain', () => {
  it('reads the keychain first, then the saved-login file', () => {
    const keychain = fakeKeychain();
    const logins = savedLoginsKeptIn(keychain);

    // A login an earlier run kept in the file still counts while the keychain has none.
    writeSavedLoginFile({ [PROD_STAGE]: BOB });
    expect(logins.read(PROD_STAGE)).toEqual(BOB);

    // Once the keychain has one, the keychain's is the login.
    keychain.save('sherlo', PROD_STAGE, JSON.stringify(ANNA));
    writeSavedLoginFile({ [PROD_STAGE]: BOB });
    expect(logins.read(PROD_STAGE)).toEqual(ANNA);
  });

  it('falls back silently to the saved-login file when no keychain answers', () => {
    const printed = vi.spyOn(process.stdout, 'write');
    const printedError = vi.spyOn(process.stderr, 'write');
    const logins = savedLoginsKeptIn(keychainThatNeverAnswers());

    logins.save(PROD_STAGE, ANNA);
    expect(readSavedLoginFile()[PROD_STAGE]).toMatchObject(ANNA);
    expect(logins.read(PROD_STAGE)).toEqual(ANNA);

    logins.remove(PROD_STAGE);
    expect(logins.read(PROD_STAGE)).toBeUndefined();

    expect(printed).not.toHaveBeenCalled();
    expect(printedError).not.toHaveBeenCalled();
  });

  it("a save into the keychain deletes that address's entry from the file", () => {
    const keychain = fakeKeychain();
    const logins = savedLoginsKeptIn(keychain);
    writeSavedLoginFile({ [PROD_STAGE]: BOB, 'https://api.test.sherlo.io/graphql': BOB });

    logins.save(PROD_STAGE, ANNA);

    expect(JSON.parse(keychain.read('sherlo', PROD_STAGE)!)).toEqual(ANNA);
    // Only this address's entry is gone; another address's login is left as it was.
    expect(Object.keys(readSavedLoginFile())).toEqual(['https://api.test.sherlo.io/graphql']);

    // And a logout deletes the login from both.
    writeSavedLoginFile({ [PROD_STAGE]: BOB });
    logins.remove(PROD_STAGE);
    expect(keychain.read('sherlo', PROD_STAGE)).toBeUndefined();
    expect(readSavedLoginFile()[PROD_STAGE]).toBeUndefined();
  });

  it('SHERLO_SAVED_LOGIN_STORE=file keeps the login in the file and never touches the keychain', () => {
    vi.stubEnv('SHERLO_SAVED_LOGIN_STORE', 'file');
    const keychain = fakeKeychain();
    const keychainActs = [
      vi.spyOn(keychain, 'read'),
      vi.spyOn(keychain, 'save'),
      vi.spyOn(keychain, 'remove'),
    ];
    const logins = savedLoginsKeptIn(keychain);

    logins.save(PROD_STAGE, ANNA);
    expect(readSavedLoginFile()[PROD_STAGE]).toMatchObject(ANNA);
    expect(logins.read(PROD_STAGE)).toEqual(ANNA);
    logins.remove(PROD_STAGE);
    expect(logins.read(PROD_STAGE)).toBeUndefined();

    logins.savePending(PROD_STAGE, pendingLoginExpiringAt('2030-01-01T00:10:00.000Z'));
    logins.readPending(PROD_STAGE);
    logins.removePending(PROD_STAGE);

    for (const keychainAct of keychainActs) expect(keychainAct).not.toHaveBeenCalled();
  });

  it('hands the token to security on its input, never in its arguments', () => {
    const runs: { args: string[]; input?: string }[] = [];
    const keptSecrets = new Map<string, string>();
    const keychain = macOsKeychain((args, input) => {
      runs.push({ args, input });
      return fakeSecurity(keptSecrets, args, input);
    });
    const logins = savedLoginsKeptIn(keychain);

    logins.save(PROD_STAGE, ANNA);

    const saveRun = runs.find((run) => run.args.includes('-i'))!;
    expect(saveRun.args).toEqual(['-i']);
    const secretAsHex = Buffer.from(JSON.stringify(ANNA), 'utf8').toString('hex');
    expect(saveRun.input).toBe(
      `add-generic-password -U -s sherlo -a ${PROD_STAGE} -X ${secretAsHex}\n`
    );
    // The token never appears in any run's arguments, nor in plain text on the input.
    for (const run of runs) expect(run.args.join(' ')).not.toContain(ANNA.token);
    expect(saveRun.input).not.toContain(ANNA.token);

    // It is read back with `-w`, which prints only the secret.
    expect(logins.read(PROD_STAGE)).toEqual(ANNA);
    expect(runs.at(-1)!.args).toEqual([
      'find-generic-password',
      '-s',
      'sherlo',
      '-a',
      PROD_STAGE,
      '-w',
    ]);
    // A keychain save leaves no file behind.
    expect(fs.existsSync(savedLoginFilePath())).toBe(false);
  });

  it('keeps a pending login until it expires, and forgets it once it is collected', () => {
    let now = Date.parse('2030-01-01T00:00:00.000Z');
    const undoSurroundings = installSurroundings(surroundingsWithClock(() => now));
    try {
      const keychain = fakeKeychain();
      const logins = savedLoginsKeptIn(keychain);
      const pendingLogin = pendingLoginExpiringAt('2030-01-01T00:10:00.000Z');

      // Kept beside the saved login, in the keychain, until it is collected.
      logins.savePending(PROD_STAGE, pendingLogin);
      expect(logins.readPending(PROD_STAGE)).toEqual(pendingLogin);
      expect(logins.read(PROD_STAGE)).toBeUndefined();
      logins.removePending(PROD_STAGE);
      expect(logins.readPending(PROD_STAGE)).toBeUndefined();

      // Kept until its expiry passes, and forgotten from the keychain then.
      logins.savePending(PROD_STAGE, pendingLogin);
      now = Date.parse('2030-01-01T00:09:59.000Z');
      expect(logins.readPending(PROD_STAGE)).toEqual(pendingLogin);
      now = Date.parse('2030-01-01T00:10:00.000Z');
      expect(logins.readPending(PROD_STAGE)).toBeUndefined();
      expect(keychain.read('sherlo-pending-login', PROD_STAGE)).toBeUndefined();

      // Where no keychain answers, the file keeps it the same way.
      now = Date.parse('2030-01-01T00:00:00.000Z');
      const fileOnlyLogins = savedLoginsKeptIn(keychainThatNeverAnswers());
      fileOnlyLogins.savePending(PROD_STAGE, pendingLogin);
      expect(fileOnlyLogins.readPending(PROD_STAGE)).toEqual(pendingLogin);
      fileOnlyLogins.removePending(PROD_STAGE);
      expect(fileOnlyLogins.readPending(PROD_STAGE)).toBeUndefined();
    } finally {
      undoSurroundings();
    }
  });
});

describe('the keychain, when it only partly answers', () => {
  it('deletes an older keychain entry when a save falls back to the file', () => {
    const keychain = fakeKeychain();
    keychain.save('sherlo', PROD_STAGE, JSON.stringify(ANNA));
    // From now on the keychain refuses every save, but still reads and deletes.
    vi.spyOn(keychain, 'save').mockImplementation(() => {
      throw new Error('the keychain is locked');
    });
    const logins = savedLoginsKeptIn(keychain);

    logins.save(PROD_STAGE, BOB);

    expect(keychain.read('sherlo', PROD_STAGE)).toBeUndefined();
    expect(readSavedLoginFile()[PROD_STAGE]).toMatchObject(BOB);
    expect(logins.read(PROD_STAGE)).toEqual(BOB);
  });

  it('writes the macOS keychain value in plain ASCII, and reads a non-ASCII email back whole', () => {
    const runs: { args: string[]; input?: string }[] = [];
    const keptSecrets = new Map<string, string>();
    const logins = savedLoginsKeptIn(
      macOsKeychain((args, input) => {
        runs.push({ args, input });
        return fakeSecurity(keptSecrets, args, input);
      })
    );
    const zoe = { token: ANNA.token, email: 'zoë.łukasz@例え.jp' };

    logins.save(PROD_STAGE, zoe);

    const saveCommand = runs.find((run) => run.args[0] === '-i')!.input!;
    const secretAsHex = saveCommand.trim().split(' ').at(-1)!;
    const secret = Buffer.from(secretAsHex, 'hex').toString('utf8');
    expect(/^[\x20-\x7e]*$/.test(secret)).toBe(true);
    expect(logins.read(PROD_STAGE)).toEqual(zoe);
  });

  it('reads security exit 44 as no entry, and deleting a missing entry is no error', () => {
    const keychain = macOsKeychain(() => ({
      exitCode: 44,
      output: '',
      errorOutput: 'The specified item could not be found in the keychain.',
    }));

    expect(keychain.read('sherlo', PROD_STAGE)).toBeUndefined();
    expect(() => keychain.remove('sherlo', PROD_STAGE)).not.toThrow();
  });

  it('counts a security save that exits 0 with error output as failed, and the file takes it', () => {
    const keychain = macOsKeychain((args) =>
      args[0] === '-i'
        ? {
            exitCode: 0,
            output: '',
            errorOutput: 'add-generic-password: User interaction is not allowed.',
          }
        : { exitCode: 44, output: '', errorOutput: '' }
    );

    expect(() => keychain.save('sherlo', PROD_STAGE, JSON.stringify(ANNA))).toThrow();

    const logins = savedLoginsKeptIn(keychain);
    logins.save(PROD_STAGE, ANNA);
    expect(readSavedLoginFile()[PROD_STAGE]).toMatchObject(ANNA);
    expect(logins.read(PROD_STAGE)).toEqual(ANNA);
  });

  it('asks the keychain library for the Secret Service store on every entry', () => {
    const entriesMade: { name: string; account: string; options: unknown }[] = [];
    const secrets = new Map<string, string>();
    class FakeEntry {
      constructor(private name: string, private account: string, options?: unknown) {
        entriesMade.push({ name, account, options });
      }
      getPassword() {
        return secrets.get(`${this.name} ${this.account}`) ?? null;
      }
      setPassword(secret: string) {
        secrets.set(`${this.name} ${this.account}`, secret);
      }
      deletePassword() {
        return secrets.delete(`${this.name} ${this.account}`);
      }
    }
    const library = { Entry: FakeEntry } as unknown as typeof import('@napi-rs/keyring');
    const keychain = keyringKeychain((call) => performKeyringCall(library, call));

    keychain.save('sherlo', PROD_STAGE, 'secret');
    expect(keychain.read('sherlo', PROD_STAGE)).toBe('secret');
    keychain.remove('sherlo', PROD_STAGE);
    expect(keychain.read('sherlo', PROD_STAGE)).toBeUndefined();

    expect(entriesMade).toHaveLength(4);
    for (const entry of entriesMade) {
      expect(entry).toEqual({
        name: 'sherlo',
        account: PROD_STAGE,
        options: { linux: { store: 'secret-service' } },
      });
    }
  });

  it('falls back to the file when the keychain library cannot be loaded', () => {
    const logins = savedLoginsKeptIn(
      keyringKeychain(() => {
        throw new Error("Cannot find module '@napi-rs/keyring-linux-x64-gnu'");
      })
    );

    logins.save(PROD_STAGE, ANNA);

    expect(readSavedLoginFile()[PROD_STAGE]).toMatchObject(ANNA);
    expect(logins.read(PROD_STAGE)).toEqual(ANNA);
  });

  it('a removal the keychain refuses is reported, never counted as done', () => {
    const keychain = fakeKeychain();
    keychain.save('sherlo', PROD_STAGE, JSON.stringify(ANNA));
    vi.spyOn(keychain, 'remove').mockImplementation(() => {
      throw new Error('the keychain is locked');
    });
    const logins = savedLoginsKeptIn(keychain);

    // The keychain still holds the login, so the logout is not done.
    expect(logins.remove(PROD_STAGE)).toBe(false);
    expect(logins.read(PROD_STAGE)).toEqual(ANNA);

    // A keychain that answers nothing at all holds nothing a read could find, so it is done.
    expect(savedLoginsKeptIn(keychainThatNeverAnswers()).remove(PROD_STAGE)).toBe(true);

    // And a removal that goes through is done.
    expect(savedLoginsKeptIn(fakeKeychain()).remove(PROD_STAGE)).toBe(true);
  });

  it('gives up on a keychain library call that does not answer in time, and the file takes over', () => {
    const neverAnswers = 'setTimeout(() => undefined, 60_000)';
    const logins = savedLoginsKeptIn(
      keyringKeychain((call) => runKeyringCallInChildProcess(call, neverAnswers, 300))
    );

    logins.save(PROD_STAGE, ANNA);

    expect(readSavedLoginFile()[PROD_STAGE]).toMatchObject(ANNA);
    expect(logins.read(PROD_STAGE)).toEqual(ANNA);
  });
});

/** A keychain kept in memory: what the store sees of a real one that answers. */
function fakeKeychain(): Keychain {
  const secrets = new Map<string, string>();
  const keyOf = (name: string, account: string) => `${name} ${account}`;

  return {
    read: (name, account) => secrets.get(keyOf(name, account)),
    save: (name, account, secret) => {
      secrets.set(keyOf(name, account), secret);
    },
    remove: (name, account) => {
      secrets.delete(keyOf(name, account));
    },
  };
}

/** A keychain whose every act throws, as one with no Secret Service or no prebuilt binary does. */
function keychainThatNeverAnswers(): Keychain {
  const noAnswer = (): never => {
    throw new Error('Platform secure storage failure: no keychain');
  };
  return { read: noAnswer, save: noAnswer, remove: noAnswer };
}

/** What `security` answers to the three commands the macOS keychain runs. */
function fakeSecurity(
  keptSecrets: Map<string, string>,
  args: string[],
  input: string | undefined
): SecurityResult {
  if (args[0] === '-i') {
    const [, , , name, , account, , secretAsHex] = input!.trim().split(' ');
    keptSecrets.set(`${name} ${account}`, Buffer.from(secretAsHex, 'hex').toString('utf8'));
    return { exitCode: 0, output: '', errorOutput: '' };
  }

  const name = args[args.indexOf('-s') + 1];
  const account = args[args.indexOf('-a') + 1];
  const secret = keptSecrets.get(`${name} ${account}`);
  if (secret === undefined) return { exitCode: 44, output: '', errorOutput: 'not found' };

  if (args[0] === 'delete-generic-password') keptSecrets.delete(`${name} ${account}`);
  return {
    exitCode: 0,
    output: args[0] === 'find-generic-password' ? `${secret}\n` : '',
    errorOutput: '',
  };
}

function pendingLoginExpiringAt(expiresAt: string): PendingLogin {
  return {
    loginId: 'login-1',
    pollSecret: 'poll-secret-1',
    authorizeUrl: 'https://app.sherlo.io/cli-login/login-1',
    expiresAt,
  };
}

function surroundingsWithClock(now: () => number): Surroundings {
  return {
    installSettings: () => () => undefined,
    readGitInfo: () => Promise.reject(new Error('not read in these cases')),
    now,
    sleep: () => Promise.resolve(),
  };
}

function writeSavedLoginFile(entries: Record<string, { token: string; email: string }>): void {
  fs.mkdirSync(path.dirname(savedLoginFilePath()), { recursive: true, mode: 0o700 });
  fs.writeFileSync(savedLoginFilePath(), JSON.stringify(entries), { mode: 0o600 });
}

function readSavedLoginFile(): Record<string, unknown> {
  if (!fs.existsSync(savedLoginFilePath())) return {};
  return JSON.parse(fs.readFileSync(savedLoginFilePath(), 'utf8'));
}
