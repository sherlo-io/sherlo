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
 * The shipped answers: the saved-login file. A missing or unreadable file reads as no login, and
 * every write leaves the file readable and writable by its owner alone.
 */
export const liveSavedLogins: SavedLogins = {
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
