/**
 * `sherlo login` (sherlo / Logging in from the terminal).
 *
 * Two ways in, each for what only it can see:
 *
 *   - `runPose` runs the shipped command through the tool's own routing, so a case reads the
 *     screen and the exit code a person gets. That screen is folded, which hides a token.
 *   - `runLoginOnSeams` calls the command straight, with the same posed seams installed by hand,
 *     so a case can read what was SAVED, and the UNFOLDED bytes - the only place a printed token
 *     would show.
 */
import { describe, expect, it } from 'vitest';
import login from '../login';
import { runPose } from '../../pose/pose';
import type { CommandPose } from '../../../seams/commandPose';
import { captureTranscript } from '../../../helpers/transcriptSink';
import { installBrowser, posedBrowser } from '../../../seams/browser';
import {
  installSavedLogins,
  posedSavedLogins,
  type PosedLogins,
  type SavedLogin,
} from '../../../seams/savedLogins';
import {
  installServerCalls,
  posedServerCalls,
  type ScriptedCall,
} from '../../../seams/serverCalls';
import { installSurroundings, posedSurroundings } from '../../../seams/surroundings';

const SERVICE_ADDRESS = 'https://api.sherlo.io/graphql';
const ENV = { SKIP_INTRO: 'true', SHERLO_API_URL: SERVICE_ADDRESS };

const LOGIN_ID = 'lg7Qm2Xa';
const EXPIRES_AT = '2026-10-01T12:10:00.000Z';
/** A moment before the pending login's expiry. */
const BEFORE_EXPIRY = '2026-10-01T12:00:05.000Z';
/** A moment after the pending login expired. */
const AFTER_EXPIRY = '2026-10-01T12:10:01.000Z';

const LOGIN_TOKEN = 'sht_newlogintoken000000000000000000';
const OLD_LOGIN_TOKEN = 'sht_oldlogintoken000000000000000000';
const EMAIL = 'anna@example.com';

const START: ScriptedCall = {
  call: 'startCliLogin',
  with: {},
  answer: {
    loginId: LOGIN_ID,
    authorizeUrl: `https://app.sherlo.io/cli-login/${LOGIN_ID}`,
    expiresAt: EXPIRES_AT,
  },
};

function poll(answer: Extract<ScriptedCall, { call: 'pollCliLogin' }>['answer']): ScriptedCall {
  return { call: 'pollCliLogin', with: { loginId: LOGIN_ID }, answer };
}

const PENDING = poll({ status: 'pending' });
const APPROVED = poll({ status: 'approved', email: EMAIL, token: LOGIN_TOKEN });

describe('sherlo login', () => {
  it('prints the authorize link on its own line whether or not the browser opened', async () => {
    const screens: string[] = [];

    for (const opened of [true, false]) {
      const { screen, exitCode, refusals } = await runPose(
        loginPose({ api: [START, APPROVED], browser: { opened } })
      );

      expect(refusals).toEqual([]);
      expect(exitCode).toBe(0);
      // The link is alone on its line: nothing but the indent around it once the colour is off.
      expect(plainLines(screen)).toContain('  <LOGIN_LINK>');
      screens.push(screen);
    }

    // One text for every case: the words under the link already say what to do without a browser.
    expect(screens[0]).toBe(screens[1]);
  });

  it("saves the token and prints Logged in as the person's email once the person authorizes", async () => {
    const { printed, refusal, savedLogin } = await runLoginOnSeams({
      api: [START, PENDING, APPROVED],
    });

    expect(refusal).toBeUndefined();
    expect(savedLogin).toEqual({ token: LOGIN_TOKEN, email: EMAIL });
    expect(plain(printed)).toContain(`Logged in as ${EMAIL}`);
  });

  it('never prints the login token', async () => {
    const loggingIn = await runLoginOnSeams({ api: [START, APPROVED] });
    const alreadyIn = await runLoginOnSeams({
      api: [listTeamsAnswer()],
      logins: { [SERVICE_ADDRESS]: { email: EMAIL, token: LOGIN_TOKEN } },
    });

    // The run that saved the token, and the run that spent it, both unfolded.
    expect(loggingIn.savedLogin?.token).toBe(LOGIN_TOKEN);
    expect(loggingIn.printed).not.toContain(LOGIN_TOKEN);
    expect(alreadyIn.printed).not.toContain(LOGIN_TOKEN);
  });

  it('says it is already logged in and starts no new login when the saved login still works', async () => {
    const { screen, exitCode, refusals, unusedCalls } = await runPose(
      loginPose({
        api: [listTeamsAnswer()],
        logins: { [SERVICE_ADDRESS]: { email: EMAIL, token: LOGIN_TOKEN } },
      })
    );

    // A started login would be a call the pose did not script, and so a refusal.
    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
    expect(plain(screen)).toContain(`Already logged in as ${EMAIL}`);
    expect(plain(screen)).not.toContain('<LOGIN_LINK>');
    expect(exitCode).toBe(0);
  });

  it('starts a new login when the service refuses the saved one', async () => {
    const { printed, refusal, savedLogin } = await runLoginOnSeams({
      api: [{ call: 'listTeams', with: {}, answer: { error: 'Unauthorized' } }, START, APPROVED],
      logins: { [SERVICE_ADDRESS]: { email: EMAIL, token: OLD_LOGIN_TOKEN } },
    });

    expect(refusal).toBeUndefined();
    expect(savedLogin).toEqual({ token: LOGIN_TOKEN, email: EMAIL });
    expect(plain(printed)).toContain(`Logged in as ${EMAIL}`);
    expect(plain(printed)).not.toContain('Already logged in');
  });

  it('says the login expired and exits 1 when nobody authorized it in time', async () => {
    // Every road to it: the clock passed `expiresAt` while the login was still pending, the
    // service itself answered that the login expired, and an `expiresAt` that is not a time - which
    // would otherwise be a wait with no end.
    const clockRanOut = loginPose({ api: [START, PENDING], clock: [AFTER_EXPIRY] });
    const serviceSaidSo = loginPose({ api: [START, PENDING, poll({ status: 'expired' })] });
    const noTimeToWaitFor = loginPose({
      api: [
        {
          call: 'startCliLogin',
          with: {},
          answer: {
            loginId: LOGIN_ID,
            authorizeUrl: `https://app.sherlo.io/cli-login/${LOGIN_ID}`,
            expiresAt: 'not a time',
          },
        },
        PENDING,
      ],
    });

    for (const pose of [clockRanOut, serviceSaidSo, noTimeToWaitFor]) {
      const { screen, exitCode, refusals, unusedCalls } = await runPose(pose);

      expect(refusals).toEqual([]);
      expect(unusedCalls).toEqual([]);
      expect(plain(screen)).toContain('ERROR: The login expired');
      expect(plain(screen)).toContain('Nobody clicked Authorize in time.');
      expect(plain(screen)).toContain('Run `npx sherlo login` to start a new one.');
      expect(exitCode).toBe(1);
    }
  });

  it('says the login was cancelled and exits 1 when the person clicked Cancel', async () => {
    const { screen, exitCode, refusals } = await runPose(
      loginPose({ api: [START, PENDING, poll({ status: 'cancelled' })] })
    );

    expect(refusals).toEqual([]);
    expect(plain(screen)).toContain('ERROR: The login was canceled in the browser.');
    expect(plain(screen)).toContain('Run `npx sherlo login` to start a new one.');
    expect(exitCode).toBe(1);
  });
});

/* ========================================================================== */

/** A `sherlo login` pose: a browser that opened, a clock before the login's expiry. */
function loginPose(stated: Partial<CommandPose>): CommandPose {
  return {
    pose: 1,
    argv: ['login'],
    files: {},
    env: ENV,
    git: 'none',
    bundles: {},
    api: [],
    masks: {},
    clock: [BEFORE_EXPIRY],
    browser: { opened: true },
    ...stated,
  };
}

/** The answer that says a saved login still works. */
function listTeamsAnswer(): ScriptedCall {
  return {
    call: 'listTeams',
    with: {},
    answer: { teams: [{ id: 'tm000001', name: 'Storefront', projectCount: 2, role: 'owner' }] },
  };
}

/**
 * Run `login()` itself on posed seams, and answer what it printed (unfolded), the refusal it ended
 * with, and the login saved under the service address afterwards.
 */
async function runLoginOnSeams(world: {
  api: ScriptedCall[];
  logins?: PosedLogins;
}): Promise<{ printed: string; refusal: string | undefined; savedLogin: SavedLogin | undefined }> {
  const logins = posedSavedLogins(world.logins);
  const surroundings = posedSurroundings({ env: ENV, git: 'none', clock: [BEFORE_EXPIRY] });

  const uninstall = [
    installServerCalls(posedServerCalls(world.api)),
    installBrowser(posedBrowser({ opened: true })),
    installSavedLogins(logins),
    installSurroundings(surroundings),
    surroundings.installSettings(),
  ];

  let refusal: string | undefined;
  try {
    const transcript = await captureTranscript(() =>
      login().catch((error: Error) => {
        refusal = error.message;
      })
    );

    return {
      printed: `${transcript.stdout}${transcript.stderr}${refusal ?? ''}`,
      refusal,
      savedLogin: logins.read(SERVICE_ADDRESS),
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

function plainLines(screen: string): string[] {
  return plain(screen).split('\n');
}
