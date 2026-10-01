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
 *
 * ------------------------------------------------------------------------
 * PLAN STAND-IN (epic cli-login). The live half below touches no file yet: the saved-login file is
 * a build task. Until it lands, the live half reads as "no login saved" and refuses to save or
 * delete one, naming itself. The posed half is the one a plan draws with.
 */

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

/** The shipped answers. A build task: until it lands, nothing is read or written. */
export const liveSavedLogins: SavedLogins = {
  read: () => undefined,
  save: () => {
    throw new Error('Saving a login is not built into this version of the CLI yet.');
  },
  remove: () => {
    throw new Error('Deleting a saved login is not built into this version of the CLI yet.');
  },
};

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
