/**
 * THE SAVED-LOGIN SEAM - the logins `sherlo login` keeps on this machine, one per service address,
 * and the login still waiting for its click.
 *
 *     live   - the operating system's keychain, and the saved-login file when no keychain answers
 *              (sherlo / Where the login is kept).
 *     posed  - the pose's `logins`: the logins saved before the run, by service address.
 *
 * Every command that spends a credential may spend the login, so they all read it here: a read
 * written straight into a command would answer from the machine the pose ran on. A posed run
 * touches NO keychain and NO file - a save or a delete changes only the posed list, for the rest of
 * that run.
 *
 * WHY EVERY CALL NAMES THE SERVICE ADDRESS. A login is saved under the address it was made
 * against, and a command spends only the login of the address it talks to, so logins to the test,
 * dev and prod stages never mix (sherlo / Logging in from the terminal). The caller passes the
 * address it talks to; this seam never guesses one.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PendingCliLogin } from './serverCalls';
import { surroundings } from './surroundings';

/** One saved login: the token the service minted for it, and whose it is. */
export type SavedLogin = {
  /** The login's personal token. Never printed. */
  token: string;
  /** The email of the person who clicked Authorize. */
  email: string;
};

/**
 * A login the service started that nobody has clicked yet. It is kept so a second run of
 * `sherlo login` can wait on the same link instead of starting a new one. Its poll secret collects
 * the token, so it is kept as carefully as a saved login.
 */
export type PendingLogin = PendingCliLogin;

/** Every act on the saved logins, and nothing else. */
export type SavedLogins = {
  /** The login saved under this service address, or undefined when there is none. */
  read(serviceAddress: string): SavedLogin | undefined;
  /** Save a login under this service address, replacing any saved before. */
  save(serviceAddress: string, login: SavedLogin): void;
  /** Delete the login saved under this service address. */
  remove(serviceAddress: string): void;

  /**
   * The login still waiting for its click under this service address, or undefined when there is
   * none or it has expired. An expired one is forgotten as it is read.
   */
  readPending(serviceAddress: string): PendingLogin | undefined;
  /** Keep a pending login under this service address, replacing any kept before. */
  savePending(serviceAddress: string, pendingLogin: PendingLogin): void;
  /** Forget the pending login under this service address: collected, cancelled or expired. */
  removePending(serviceAddress: string): void;
};

/* ========================================================================== */
/* The keychain                                                               */
/* ========================================================================== */

/**
 * The operating system's keychain: one secret per name and account. Every act throws when the
 * keychain does not answer, and the store above it then uses the file instead.
 */
export type Keychain = {
  /** The secret kept under this name and account, or undefined when there is none. */
  read(name: string, account: string): string | undefined;
  /** Keep a secret under this name and account, replacing any kept before. */
  save(name: string, account: string, secret: string): void;
  /** Delete the secret under this name and account. Deleting one that is not there is no error. */
  remove(name: string, account: string): void;
};

/** The name a saved login is kept under in the keychain. The account is the service address. */
const SAVED_LOGIN_KEYCHAIN_NAME = 'sherlo';

/** The name a pending login is kept under in the keychain, beside the saved login. */
const PENDING_LOGIN_KEYCHAIN_NAME = 'sherlo-pending-login';

/** One run of macOS's `security` program: its arguments, and what is written to its input. */
export type SecurityRun = (args: string[], input?: string) => SecurityResult;

export type SecurityResult = { exitCode: number | null; output: string; errorOutput: string };

/** What `security` exits with when the entry it was asked about does not exist. */
const SECURITY_ENTRY_NOT_FOUND = 44;

/** How long one run of `security` may take before the keychain counts as not answering. */
const SECURITY_TIME_LIMIT_MS = 10_000;

/** Run Apple's own `/usr/bin/security`, never one found on the PATH. */
const runSecurity: SecurityRun = (args, input) => {
  const result = spawnSync('/usr/bin/security', args, {
    input,
    encoding: 'utf8',
    timeout: SECURITY_TIME_LIMIT_MS,
  });
  if (result.error) throw result.error;

  return { exitCode: result.status, output: result.stdout, errorOutput: result.stderr };
};

/**
 * The macOS keychain, through Apple's own `security` program.
 *
 * WHY `security` AND NOT A LIBRARY. A library asks the keychain as node itself, and a node not
 * signed by Node.js gets a keychain dialog that waits with no time limit, again after every
 * upgrade. `security` is the entry's own program, so it is never asked.
 *
 * WHY THE SAVE GOES ON ITS INPUT. Anything on a program's command line shows in a list of running
 * processes. So a save starts `security -i`, which reads its command from its input, and the
 * secret travels hex-encoded inside that command, never in the arguments.
 */
export function macOsKeychain(security: SecurityRun = runSecurity): Keychain {
  return {
    read: (name, account) => {
      const result = security(['find-generic-password', '-s', name, '-a', account, '-w']);
      if (result.exitCode === SECURITY_ENTRY_NOT_FOUND) return undefined;
      if (result.exitCode !== 0) throw new Error(`security could not read: ${result.errorOutput}`);

      // `-w` prints the secret followed by one newline.
      return result.output.replace(/\n$/, '');
    },

    save: (name, account, secret) => {
      // The command is one line `security -i` splits on spaces, so a name or account that could
      // split it is refused here, and the file takes the login instead.
      if (!isOneWord(name) || !isOneWord(account)) {
        throw new Error('the keychain entry name does not fit on one security command line');
      }
      const secretAsHex = Buffer.from(secret, 'utf8').toString('hex');
      const command = `add-generic-password -U -s ${name} -a ${account} -X ${secretAsHex}\n`;

      const result = security(['-i'], command);
      // `security -i` can exit 0 when its command failed, so anything it complains about counts.
      if (result.exitCode !== 0 || result.errorOutput.trim() !== '') {
        throw new Error(`security could not save: ${result.errorOutput}`);
      }
    },

    remove: (name, account) => {
      const result = security(['delete-generic-password', '-s', name, '-a', account]);
      if (result.exitCode === SECURITY_ENTRY_NOT_FOUND) return;
      if (result.exitCode !== 0) {
        throw new Error(`security could not delete: ${result.errorOutput}`);
      }
    },
  };
}

function isOneWord(text: string): boolean {
  return text !== '' && !/[\s"'\\]/.test(text);
}

type KeyringLibrary = typeof import('@napi-rs/keyring');

/**
 * The Linux and Windows keychain, through a prebuilt keychain library. The library is loaded at
 * the first act, not before, so a run that keeps its login in the file never loads it, and a
 * machine whose platform has no prebuilt binary throws here - and the file takes the login.
 */
export function keyringKeychain(
  loadLibrary: () => KeyringLibrary = () => require('@napi-rs/keyring')
): Keychain {
  let library: KeyringLibrary | undefined;

  const entryFor = (name: string, account: string) => {
    library ??= loadLibrary();

    // On Linux only the Secret Service (gnome-keyring, KWallet) keeps a login across a restart;
    // the library's other store, the kernel keyring, forgets it. Requiring the Secret Service makes
    // a machine without one throw, so the file takes the login instead.
    return new library.Entry(name, account, { linux: { store: 'secret-service' } });
  };

  return {
    read: (name, account) => entryFor(name, account).getPassword() ?? undefined,
    save: (name, account, secret) => entryFor(name, account).setPassword(secret),
    remove: (name, account) => {
      entryFor(name, account).deletePassword();
    },
  };
}

/** This machine's keychain: `security` on macOS, the keychain library everywhere else. */
function thisMachinesKeychain(): Keychain {
  return process.platform === 'darwin' ? macOsKeychain() : keyringKeychain();
}

/* ========================================================================== */
/* The live store: the keychain first, the file when no keychain answers      */
/* ========================================================================== */

/** One record per service address, in one place. */
type AddressStore<Kept> = {
  read(serviceAddress: string): Kept | undefined;
  save(serviceAddress: string, kept: Kept): void;
  remove(serviceAddress: string): void;
};

/**
 * The saved logins kept in this keychain, falling back to the saved-login file silently: nothing
 * is ever printed about which one answered, so a script sees the same output either way.
 *
 * SHERLO_SAVED_LOGIN_STORE=file keeps the logins in the file alone and never touches the keychain:
 * a run that must keep its login in its own folder (one among many on one machine) says so.
 */
export function savedLoginsKeptIn(keychain: Keychain): SavedLogins {
  const logins = keychainFirst(
    keychainAddressStore(keychain, SAVED_LOGIN_KEYCHAIN_NAME, toSavedLogin),
    fileAddressStore(savedLoginFilePath, toSavedLogin)
  );
  const pendingLogins = keychainFirst(
    keychainAddressStore(keychain, PENDING_LOGIN_KEYCHAIN_NAME, toPendingLogin),
    fileAddressStore(pendingLoginFilePath, toPendingLogin)
  );

  return {
    read: logins.read,
    save: logins.save,
    remove: logins.remove,

    readPending: (serviceAddress) => {
      const pendingLogin = pendingLogins.read(serviceAddress);
      if (!pendingLogin) return undefined;

      if (hasExpired(pendingLogin)) {
        pendingLogins.remove(serviceAddress);
        return undefined;
      }

      return pendingLogin;
    },
    savePending: pendingLogins.save,
    removePending: pendingLogins.remove,
  };
}

/**
 * Has the service's own expiry passed, by the clock in force (a posed run's is the pose's)? An
 * expiry that is not a time has no end to wait for, so it counts as passed.
 */
function hasExpired(pendingLogin: PendingLogin): boolean {
  const expiresAt = Date.parse(pendingLogin.expiresAt);
  return Number.isNaN(expiresAt) || surroundings().now() >= expiresAt;
}

/** The shipped answers: this machine's keychain, and the saved-login file when it does not answer. */
export const liveSavedLogins: SavedLogins = savedLoginsKeptIn(thisMachinesKeychain());

/**
 * The keychain first, then the file.
 *
 *     read   - the keychain's record; when it has none, or does not answer, the file's. The file
 *              is read even after a keychain miss, so a login an earlier run kept in the file
 *              still counts.
 *     save   - into the keychain, and then out of the file, so no plain copy is left behind; into
 *              the file only when the keychain cannot take it, and then any older keychain entry
 *              is deleted, so it cannot hide the newer one in the file.
 *     remove - from both, so a logout leaves the token nowhere.
 */
function keychainFirst<Kept>(
  inKeychain: AddressStore<Kept>,
  inFile: AddressStore<Kept>
): AddressStore<Kept> {
  const keychainIsAllowed = () => process.env.SHERLO_SAVED_LOGIN_STORE !== 'file';

  return {
    read: (serviceAddress) => {
      if (keychainIsAllowed()) {
        const keptInKeychain = ignoringFailure(() => inKeychain.read(serviceAddress));
        if (keptInKeychain) return keptInKeychain;
      }

      return inFile.read(serviceAddress);
    },

    save: (serviceAddress, kept) => {
      if (keychainIsAllowed()) {
        const savedInKeychain = ignoringFailure(() => {
          inKeychain.save(serviceAddress, kept);
          return true;
        });
        if (savedInKeychain) {
          inFile.remove(serviceAddress);
          return;
        }

        // The keychain would not take it, but an older entry there would still be read first and
        // hide the one the file is about to keep: delete it, if the keychain lets us.
        ignoringFailure(() => inKeychain.remove(serviceAddress));
      }

      inFile.save(serviceAddress, kept);
    },

    remove: (serviceAddress) => {
      if (keychainIsAllowed()) ignoringFailure(() => inKeychain.remove(serviceAddress));

      inFile.remove(serviceAddress);
    },
  };
}

/** What `act` answers, or undefined when it throws: a keychain that did not answer. */
function ignoringFailure<Answer>(act: () => Answer): Answer | undefined {
  try {
    return act();
  } catch {
    return undefined;
  }
}

/**
 * Kept in the keychain under one name, the service address as the account, as JSON written in
 * plain ASCII. macOS's `security` answers a secret holding anything outside ASCII as hex rather
 * than text, so every other character is written as its `\uXXXX` escape, which JSON reads back
 * as the same character.
 */
function keychainAddressStore<Kept>(
  keychain: Keychain,
  name: string,
  toKept: (value: unknown) => Kept | undefined
): AddressStore<Kept> {
  return {
    read: (serviceAddress) => {
      const secret = keychain.read(name, serviceAddress);
      return secret === undefined ? undefined : toKept(JSON.parse(secret));
    },
    save: (serviceAddress, kept) => keychain.save(name, serviceAddress, asciiJson(kept)),
    remove: (serviceAddress) => keychain.remove(name, serviceAddress),
  };
}

/** JSON with every character outside printable ASCII written as its `\uXXXX` escape. */
function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

/** A saved login out of whatever was kept, or undefined when it is not one. */
function toSavedLogin(value: unknown): SavedLogin | undefined {
  const kept = value as Partial<SavedLogin> | undefined;
  if (typeof kept?.token !== 'string' || typeof kept.email !== 'string') return undefined;

  return { token: kept.token, email: kept.email };
}

/** A pending login out of whatever was kept, or undefined when it is not one. */
function toPendingLogin(value: unknown): PendingLogin | undefined {
  const kept = value as Partial<PendingLogin> | undefined;
  if (
    typeof kept?.loginId !== 'string' ||
    typeof kept.pollSecret !== 'string' ||
    typeof kept.authorizeUrl !== 'string' ||
    typeof kept.expiresAt !== 'string'
  ) {
    return undefined;
  }

  return {
    loginId: kept.loginId,
    pollSecret: kept.pollSecret,
    authorizeUrl: kept.authorizeUrl,
    expiresAt: kept.expiresAt,
  };
}

/* ========================================================================== */
/* The files                                                                  */
/* ========================================================================== */

/** The file: its owner may read and write it, and nobody else may do either. */
const OWNER_ONLY_FILE = 0o600;

/** The `sherlo` folder: its owner alone may list, enter or change it. */
const OWNER_ONLY_FOLDER = 0o700;

/** `$XDG_CONFIG_HOME/sherlo/credentials.json`, or `~/.config/sherlo/credentials.json`. */
export function savedLoginFilePath(): string {
  return path.join(sherloConfigFolder(), 'credentials.json');
}

/** The pending logins' file, beside the saved-login file. */
export function pendingLoginFilePath(): string {
  return path.join(sherloConfigFolder(), 'pending-logins.json');
}

function sherloConfigFolder(): string {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'sherlo');
}

/** A file's shape: one entry per service address, each stamped with when it was saved. */
type EntryFile = { [serviceAddress: string]: unknown };

/**
 * Kept in an owner-only file, one entry per service address. A missing or unreadable file reads as
 * nothing kept, and every write leaves the file readable and writable by its owner alone.
 */
function fileAddressStore<Kept extends object>(
  filePath: () => string,
  toKept: (value: unknown) => Kept | undefined
): AddressStore<Kept> {
  return {
    read: (serviceAddress) => toKept(readEntryFile(filePath())[serviceAddress]),

    save: (serviceAddress, kept) => {
      const entries = readEntryFile(filePath());
      entries[serviceAddress] = { ...kept, savedAt: new Date().toISOString() };
      writeEntryFile(filePath(), entries);
    },

    remove: (serviceAddress) => {
      const entries = readEntryFile(filePath());
      if (!(serviceAddress in entries)) return;

      delete entries[serviceAddress];
      writeEntryFile(filePath(), entries);
    },
  };
}

function readEntryFile(filePath: string): EntryFile {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const isEntryMap = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);

    return isEntryMap ? (parsed as EntryFile) : {};
  } catch {
    return {};
  }
}

/**
 * Write the whole file ATOMICALLY: into a new file beside it, created owner-only, then renamed over
 * it. A token is never written into a file somebody loosened, and a crash mid-write leaves the old
 * file whole rather than half a file.
 */
function writeEntryFile(filePath: string, entries: EntryFile): void {
  const newFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: OWNER_ONLY_FOLDER });

  try {
    // `wx`: created here, never an existing file reused - so the mode below is the file's mode.
    fs.writeFileSync(newFilePath, `${JSON.stringify(entries, null, 2)}\n`, {
      mode: OWNER_ONLY_FILE,
      flag: 'wx',
    });
    fs.renameSync(newFilePath, filePath);
  } catch (error) {
    fs.rmSync(newFilePath, { force: true });
    throw error;
  }
}

/* ========================================================================== */
/* The saved logins in force                                                  */
/* ========================================================================== */

let installed: SavedLogins = liveSavedLogins;

/** The saved logins in force. */
export function savedLogins(): SavedLogins {
  return installed;
}

/** Install saved logins for the duration of one posed run; the returned function undoes it. */
export function installSavedLogins(next: SavedLogins): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* The posed saved logins                                                     */
/* ========================================================================== */

/**
 * The logins saved on the machine before the run, keyed by the service address each was made
 * against - the same address the run talks to, which is **SHERLO_API_URL** when the pose's `env`
 * sets it. An address with no entry has no login, and a pose with no `logins` is a machine nobody
 * has logged in on.
 */
export type PosedLogins = Record<string, { email: string; token: string }>;

/**
 * The saved logins a pose declares. Nothing to refuse: an unstated login does not exist. A save or
 * a delete changes this run's own copy, so a command that reads back what it saved sees it, and no
 * file anywhere is touched.
 *
 * A posed run starts with no pending login; one the run keeps lasts for the rest of that run, or
 * until the pose's clock passes its expiry.
 */
export function posedSavedLogins(posed: PosedLogins | undefined): SavedLogins {
  const logins: PosedLogins = { ...posed };
  const pendingLogins: Record<string, PendingLogin> = {};

  return {
    read: (serviceAddress) => {
      const login = logins[serviceAddress];
      return login ? { token: login.token, email: login.email } : undefined;
    },

    save: (serviceAddress, login) => {
      logins[serviceAddress] = { token: login.token, email: login.email };
    },

    remove: (serviceAddress) => {
      delete logins[serviceAddress];
    },

    readPending: (serviceAddress) => {
      const pendingLogin = pendingLogins[serviceAddress];
      if (!pendingLogin) return undefined;

      if (hasExpired(pendingLogin)) {
        delete pendingLogins[serviceAddress];
        return undefined;
      }

      return pendingLogin;
    },

    savePending: (serviceAddress, pendingLogin) => {
      pendingLogins[serviceAddress] = { ...pendingLogin };
    },

    removePending: (serviceAddress) => {
      delete pendingLogins[serviceAddress];
    },
  };
}
