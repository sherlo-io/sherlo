/**
 * THE SAVED-LOGIN SEAM - the logins `sherlo login` keeps on this machine, one per service address.
 *
 *     live   - the saved-login file, ~/.config/sherlo/credentials.json (or a `sherlo` folder under
 *              XDG_CONFIG_HOME), readable by its owner alone.
 *     posed  - the pose's `logins`: the logins saved before the run, by service address.
 *
 * Every command that spends a credential may spend the login, so they all read it here: a read
 * written straight into a command would answer from the file on the machine the pose ran on. A
 * posed run reads and writes NO file - a save or a delete changes only the posed list, for the rest
 * of that run.
 *
 * WHY EVERY CALL NAMES THE SERVICE ADDRESS. A login is saved under the address it was made
 * against, and a command spends only the login of the address it talks to, so logins to the test,
 * dev and prod stages never mix (sherlo / Logging in from the terminal). The caller passes the
 * address it talks to; this seam never guesses one.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

/** One saved login: the token the service minted for it, and whose it is. */
export type SavedLogin = {
  /** The login's personal token. Never printed. */
  token: string;
  /** The email of the person who clicked Authorize. */
  email: string;
};

/** Every act on the saved logins, and nothing else. */
export type SavedLogins = {
  /** The login saved under this service address, or undefined when there is none. */
  read(serviceAddress: string): SavedLogin | undefined;
  /** Save a login under this service address, replacing any saved before. */
  save(serviceAddress: string, login: SavedLogin): void;
  /** Delete the login saved under this service address. */
  remove(serviceAddress: string): void;
};

/**
 * SPIKE (keychain): the shipped answers - the OS keychain first, the saved-login file when no
 * keychain answers, silently.
 *
 *     read   - the keychain's entry; when the keychain has none, or cannot be reached, the file's.
 *              The file is read even after a keychain miss, so a login an earlier run had to keep in
 *              the file (no keychain then) and a login saved before the keychain existed still count.
 *     save   - into the keychain, and then out of the file, so no plain copy of the token is left
 *              behind; into the file only when the keychain cannot take it.
 *     remove - from both, so a logout leaves the token nowhere.
 *
 * SHERLO_SAVED_LOGIN_STORE=file skips the keychain entirely: a run that must keep its login in its
 * own folder (one storyline among many on one machine) says so, and the machine's keychain is never
 * touched.
 */
export const liveSavedLogins: SavedLogins = {
  read: (serviceAddress) => {
    const keychain = reachableKeychain();
    if (keychain) {
      try {
        const keychainLogin = keychain.read(serviceAddress);
        if (keychainLogin) return keychainLogin;
      } catch {
        // The keychain is there but did not answer (locked, no Secret Service daemon): the file.
      }
    }
    return fileSavedLogins.read(serviceAddress);
  },

  save: (serviceAddress, login) => {
    const keychain = reachableKeychain();
    if (keychain) {
      try {
        keychain.save(serviceAddress, login);
        fileSavedLogins.remove(serviceAddress);
        return;
      } catch {
        // The keychain cannot take it: the owner-only file does.
      }
    }
    fileSavedLogins.save(serviceAddress, login);
  },

  remove: (serviceAddress) => {
    const keychain = reachableKeychain();
    if (keychain) {
      try {
        keychain.remove(serviceAddress);
      } catch {
        // Nothing to delete where nothing answers.
      }
    }
    fileSavedLogins.remove(serviceAddress);
  },
};

/* ========================================================================== */
/* SPIKE: the keychain store                                                  */
/* ========================================================================== */

/** The name every Sherlo login is kept under in the keychain; the account is the service address. */
const KEYCHAIN_SERVICE = 'sherlo';

/** The value kept in one keychain entry: the token and whose it is, as one small JSON string. */
type KeychainValue = { token: string; email: string };

type KeyringModule = typeof import('@napi-rs/keyring');

let keyringModule: KeyringModule | null | undefined;

/**
 * The keychain store, or undefined when this run must not or cannot use one: the run asked for the
 * file, or the prebuilt keyring binary for this platform is missing (an unsupported platform, or an
 * install that skipped optional dependencies). A missing binary is found once, at the first call.
 */
export function reachableKeychain(): SavedLogins | undefined {
  if (process.env.SHERLO_SAVED_LOGIN_STORE === 'file') return undefined;

  if (keyringModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      keyringModule = require('@napi-rs/keyring') as KeyringModule;
    } catch {
      keyringModule = null;
    }
  }
  if (!keyringModule) return undefined;

  const { Entry } = keyringModule;
  // On Linux, only the Secret Service (gnome-keyring, KWallet) keeps a login across a restart; the
  // library's own fallback, the kernel keyring, forgets it. Requiring the Secret Service makes a
  // machine without one throw, and the file takes the login instead.
  const entryOf = (serviceAddress: string) =>
    new Entry(KEYCHAIN_SERVICE, serviceAddress, { linux: { store: 'secret-service' } });

  return {
    read: (serviceAddress) => {
      const value = entryOf(serviceAddress).getPassword();
      if (!value) return undefined;

      const parsed = JSON.parse(value) as Partial<KeychainValue>;
      if (typeof parsed.token !== 'string' || typeof parsed.email !== 'string') return undefined;
      return { token: parsed.token, email: parsed.email };
    },

    save: (serviceAddress, login) => {
      const value: KeychainValue = { token: login.token, email: login.email };
      entryOf(serviceAddress).setPassword(JSON.stringify(value));
    },

    remove: (serviceAddress) => {
      entryOf(serviceAddress).deletePassword();
    },
  };
}

/* ========================================================================== */
/* The saved-login file                                                       */
/* ========================================================================== */

/**
 * The saved-login file. A missing or unreadable file reads as no login, and every write leaves the
 * file readable and writable by its owner alone.
 */
export const fileSavedLogins: SavedLogins = {
  read: (serviceAddress) => {
    const entry = readSavedLoginFile()[serviceAddress];
    if (typeof entry?.token !== 'string' || typeof entry.email !== 'string') return undefined;

    return { token: entry.token, email: entry.email };
  },

  save: (serviceAddress, login) => {
    const entries = readSavedLoginFile();
    entries[serviceAddress] = {
      token: login.token,
      email: login.email,
      savedAt: new Date().toISOString(),
    };
    writeSavedLoginFile(entries);
  },

  remove: (serviceAddress) => {
    const entries = readSavedLoginFile();
    if (!(serviceAddress in entries)) return;

    delete entries[serviceAddress];
    writeSavedLoginFile(entries);
  },
};

/** The saved-login file's shape: one entry per service address. */
type SavedLoginFile = Record<string, { token: string; email: string; savedAt: string }>;

/** The file: its owner may read and write it, and nobody else may do either. */
const OWNER_ONLY_FILE = 0o600;

/** The `sherlo` folder: its owner alone may list, enter or change it. */
const OWNER_ONLY_FOLDER = 0o700;

/** `$XDG_CONFIG_HOME/sherlo/credentials.json`, or `~/.config/sherlo/credentials.json`. */
export function savedLoginFilePath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'sherlo', 'credentials.json');
}

function readSavedLoginFile(): SavedLoginFile {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(savedLoginFilePath(), 'utf8'));
    const isEntryMap = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);

    return isEntryMap ? (parsed as SavedLoginFile) : {};
  } catch {
    return {};
  }
}

/**
 * Write the whole file ATOMICALLY: into a new file beside it, created owner-only, then renamed over
 * it. A token is never written into a file somebody loosened, and a crash mid-write leaves the old
 * file whole rather than half a file.
 */
function writeSavedLoginFile(entries: SavedLoginFile): void {
  const filePath = savedLoginFilePath();
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
 */
export function posedSavedLogins(posed: PosedLogins | undefined): SavedLogins {
  const logins: PosedLogins = { ...posed };

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
  };
}
