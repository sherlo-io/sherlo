/**
 * `sherlo logout` (sherlo / Logging in from the terminal, "What does sherlo logout do?").
 *
 * `runPose` gives the screen and the exit code a person gets; `runLogoutOnSeams` calls the command
 * straight on posed seams that keep a journal, so a case can read what happened, in what order, and
 * what is left saved afterwards.
 */
import { describe, expect, it } from 'vitest';
import logout from '../logout';
import { runPose } from '../../pose/pose';
import type { CommandPose } from '../../../seams/commandPose';
import { captureTranscript } from '../../../helpers/transcriptSink';
import {
  installSavedLogins,
  posedSavedLogins,
  type PosedLogins,
  type SavedLogin,
} from '../../../seams/savedLogins';
import {
  installServerCalls,
  posedServerCalls,
  ServiceRefusedTokenError,
  type ScriptedCall,
} from '../../../seams/serverCalls';
import { installSurroundings, posedSurroundings } from '../../../seams/surroundings';

const SERVICE_ADDRESS = 'https://api.sherlo.io/graphql';
const OTHER_SERVICE_ADDRESS = 'https://api.test.sherlo.io/graphql';
const ENV = { SKIP_INTRO: 'true', SHERLO_API_URL: SERVICE_ADDRESS };

const ANNA = { email: 'anna@example.com', token: 'sht_annatoken0000000000000000000000' };
const BOB = { email: 'bob@example.com', token: 'sht_bobtoken00000000000000000000000' };

const ENDED: ScriptedCall = { call: 'logOutCli', with: {}, answer: {} };
const UNREACHABLE: ScriptedCall = {
  call: 'logOutCli',
  with: {},
  answer: { error: 'fetch failed' },
};

describe('sherlo logout', () => {
  it('ends the login on the service and then deletes it from the saved-login file', async () => {
    const { journal, printed, refusal, loginLeftSaved, otherLoginLeftSaved } =
      await runLogoutOnSeams({
        api: [ENDED],
        logins: { [SERVICE_ADDRESS]: ANNA, [OTHER_SERVICE_ADDRESS]: BOB },
      });

    expect(refusal).toBeUndefined();
    expect(journal).toEqual([`ended the login ${ANNA.token}`, `deleted ${SERVICE_ADDRESS}`]);
    expect(loginLeftSaved).toBeUndefined();
    // Only the login of the address in use is touched.
    expect(otherLoginLeftSaved).toEqual(BOB);
    expect(plain(printed)).toContain(`Logged out ${ANNA.email}`);
  });

  it('deletes the saved login, says it was not ended on the service, and exits 1 when the service cannot be reached', async () => {
    const onSeams = await runLogoutOnSeams({
      api: [UNREACHABLE],
      logins: { [SERVICE_ADDRESS]: ANNA },
    });

    expect(onSeams.journal).toEqual([
      `ended the login ${ANNA.token}`,
      `deleted ${SERVICE_ADDRESS}`,
    ]);
    expect(onSeams.loginLeftSaved).toBeUndefined();

    const { screen, exitCode, refusals } = await runPose(
      logoutPose({ api: [UNREACHABLE], logins: { [SERVICE_ADDRESS]: ANNA } })
    );

    expect(refusals).toEqual([]);
    expect(plain(screen)).toContain(
      `ERROR: Deleted the login of ${ANNA.email} from this computer, but Sherlo could not be reached to end it there.`
    );
    expect(plain(screen)).toContain('It ends by itself after 90 days unused.');
    expect(plain(screen)).not.toContain('Logged out');
    expect(exitCode).toBe(1);
  });

  it('deletes the saved login and logs out as usual when the service refuses its token as already ended', async () => {
    const { journal, printed, refusal, loginLeftSaved } = await runLogoutOnSeams({
      api: [],
      logins: { [SERVICE_ADDRESS]: ANNA },
      serviceRefusesTheToken: true,
    });

    // No refusal is an exit of 0: the login was already ended on the service.
    expect(refusal).toBeUndefined();
    expect(journal).toEqual([`ended the login ${ANNA.token}`, `deleted ${SERVICE_ADDRESS}`]);
    expect(loginLeftSaved).toBeUndefined();
    expect(plain(printed)).toContain(`Logged out ${ANNA.email}`);
    expect(plain(printed)).not.toContain('could not be reached');
  });

  it('says it is not logged in and exits 0 when no login is saved', async () => {
    // A login saved under another address is not this address's login.
    const { screen, exitCode, refusals, unusedCalls } = await runPose(
      logoutPose({ api: [], logins: { [OTHER_SERVICE_ADDRESS]: BOB } })
    );

    // Nothing to end: a call to the service would be one the pose did not script.
    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
    expect(plain(screen)).toContain('Not logged in');
    expect(plain(screen)).toContain('Run `npx sherlo login` to log in.');
    expect(exitCode).toBe(0);
  });
});

/* ========================================================================== */

function logoutPose(stated: Partial<CommandPose>): CommandPose {
  return {
    pose: 1,
    argv: ['logout'],
    files: {},
    env: ENV,
    git: 'none',
    bundles: {},
    api: [],
    masks: {},
    ...stated,
  };
}

/**
 * Run `logout()` itself on posed seams that write down each act on the service and on the saved
 * logins, in the order they happened.
 */
async function runLogoutOnSeams(world: {
  api: ScriptedCall[];
  logins: PosedLogins;
  /** The service answers, and refuses the token - what the live half raises for a 401. */
  serviceRefusesTheToken?: boolean;
}): Promise<{
  journal: string[];
  printed: string;
  refusal: string | undefined;
  loginLeftSaved: SavedLogin | undefined;
  otherLoginLeftSaved: SavedLogin | undefined;
}> {
  const journal: string[] = [];
  const server = posedServerCalls(world.api);
  const logins = posedSavedLogins(world.logins);
  const surroundings = posedSurroundings({ env: ENV, git: 'none' });

  const uninstall = [
    installServerCalls({
      ...server,
      logOutCli: async (request) => {
        journal.push(`ended the login ${request.personalToken}`);
        if (world.serviceRefusesTheToken) throw new ServiceRefusedTokenError();
        return server.logOutCli(request);
      },
    }),
    installSavedLogins({
      ...logins,
      remove: (serviceAddress) => {
        journal.push(`deleted ${serviceAddress}`);
        return logins.remove(serviceAddress);
      },
    }),
    installSurroundings(surroundings),
    surroundings.installSettings(),
  ];

  let refusal: string | undefined;
  try {
    const transcript = await captureTranscript(() =>
      logout().catch((error: Error) => {
        refusal = error.message;
      })
    );

    return {
      journal,
      printed: `${transcript.stdout}${transcript.stderr}${refusal ?? ''}`,
      refusal,
      loginLeftSaved: logins.read(SERVICE_ADDRESS),
      otherLoginLeftSaved: logins.read(OTHER_SERVICE_ADDRESS),
    };
  } finally {
    for (const undo of uninstall.reverse()) undo();
  }
}

/** A screen with its colour taken off, for a case about words rather than styling. */
function plain(screen: string): string {
  // eslint-disable-next-line no-control-regex
  return screen.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}
