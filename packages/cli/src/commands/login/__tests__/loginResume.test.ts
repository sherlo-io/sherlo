/**
 * `npx sherlo login` AS IT WAITS AND RESUMES (sherlo / Logging in from the terminal).
 *
 * Each case calls the command straight, on posed seams installed by hand, so it can run the
 * command twice against ONE set of saved logins - the second run of a person, or of an agent whose
 * shell gave up on the first - and say whether the screen it prints to is a terminal.
 */
import { describe, expect, it } from 'vitest';
import login from '../login';
import { captureTranscript } from '../../../helpers/transcriptSink';
import { installBrowser, posedBrowser } from '../../../seams/browser';
import { installSavedLogins, posedSavedLogins, type SavedLogins } from '../../../seams/savedLogins';
import {
  installServerCalls,
  posedServerCalls,
  type ScriptedCall,
} from '../../../seams/serverCalls';
import { installSurroundings, posedSurroundings } from '../../../seams/surroundings';

const SERVICE_ADDRESS = 'https://api.sherlo.io/graphql';

const LOGIN_ID = 'lg7Qm2Xa';
const AUTHORIZE_URL = `https://app.sherlo.io/cli-login/${LOGIN_ID}`;
/** The service's own expiry: fifteen minutes after the login started, not ten. */
const EXPIRES_AT = '2026-10-01T12:15:00.000Z';
const STARTED = '2026-10-01T12:00:05.000Z';
/** Past ten minutes from the start, and still before the service's expiry. */
const ELEVEN_MINUTES_IN = '2026-10-01T12:11:00.000Z';
const AFTER_EXPIRY = '2026-10-01T12:15:01.000Z';

const EMAIL = 'anna@example.com';
const LOGIN_TOKEN = 'sht_resumelogintoken00000000000000';

function start(expiresAt = EXPIRES_AT): ScriptedCall {
  return {
    call: 'startCliLogin',
    with: {},
    answer: { loginId: LOGIN_ID, authorizeUrl: AUTHORIZE_URL, expiresAt },
  };
}

function poll(answer: Extract<ScriptedCall, { call: 'pollCliLogin' }>['answer']): ScriptedCall {
  return { call: 'pollCliLogin', with: { loginId: LOGIN_ID }, answer };
}

const PENDING = poll({ status: 'pending' });
const APPROVED = poll({ status: 'approved', email: EMAIL, token: LOGIN_TOKEN });
/** The service could not be reached mid-wait: the run ends, as a killed one would, unfinished. */
const SERVICE_LOST = poll({ error: 'Network request failed' });

describe('npx sherlo login, as it waits and resumes', () => {
  it('a second run waits on the pending login the first one left, with no new link', async () => {
    const logins = posedSavedLogins(undefined);

    const firstRun = await runLogin({ api: [start(), PENDING, SERVICE_LOST], logins });
    expect(firstRun.refusal).toContain('Network request failed');
    expect(pendingLoginIn(logins)?.authorizeUrl).toBe(AUTHORIZE_URL);

    // The second run's script holds no `startCliLogin`: starting a new login would be a call the
    // pose cannot answer, and so a refusal.
    const secondRun = await runLogin({ api: [APPROVED], logins });

    expect(secondRun.unansweredCalls).toEqual([]);
    expect(secondRun.unusedCalls).toEqual([]);
    expect(secondRun.refusal).toBeUndefined();
    expect(plainLines(secondRun.printed)).toContain(`  ${AUTHORIZE_URL}`);
    expect(plain(secondRun.printed)).toContain(`Logged in as ${EMAIL}`);
    expect(logins.read(SERVICE_ADDRESS)).toEqual({ token: LOGIN_TOKEN, email: EMAIL });

    // Collected, the pending login is forgotten: a third run would start a new one.
    expect(pendingLoginIn(logins)).toBeUndefined();
  });

  it("says the login expired at the service's own expiry, never a fixed ten minutes", async () => {
    // Eleven minutes in, the wait still waits: the service's expiry is fifteen minutes away.
    const pastTenMinutes = await runLogin({
      api: [start(), PENDING, APPROVED],
      clock: [ELEVEN_MINUTES_IN],
    });
    expect(pastTenMinutes.refusal).toBeUndefined();
    expect(plain(pastTenMinutes.printed)).toContain(`Logged in as ${EMAIL}`);

    // Past the service's expiry, the refusal names that expiry.
    const pastExpiry = await runLogin({ api: [start(), PENDING], clock: [AFTER_EXPIRY] });
    expect(pastExpiry.refusal).toContain(
      'ERROR: The login expired at 12:15 UTC. Nobody clicked Authorize in time.'
    );
    expect(pastExpiry.refusal).not.toMatch(/10 minutes|ten minutes/);

    // Another expiry, another time: the words follow the service.
    const otherExpiry = await runLogin({
      api: [start('2026-10-01T12:03:00.000Z'), poll({ status: 'expired' })],
    });
    expect(otherExpiry.refusal).toContain('ERROR: The login expired at 12:03 UTC.');

    // An expired login is spent: the next run starts a new one.
    const logins = posedSavedLogins(undefined);
    await runLogin({ api: [start(), poll({ status: 'expired' })], logins });
    expect(pendingLoginIn(logins)).toBeUndefined();
  });

  it('says the browser is opening before it prints the link', async () => {
    const { printed } = await runLogin({ api: [start(), APPROVED] });
    const lines = plainLines(printed);

    const opening = lines.indexOf('Opening your browser to log in to Sherlo...');
    const link = lines.indexOf(`  ${AUTHORIZE_URL}`);

    expect(opening).toBeGreaterThanOrEqual(0);
    expect(link).toBeGreaterThan(opening);
    expect(lines.slice(opening, link)).toContain(
      "If it doesn't open, use this link on any device:"
    );
  });

  it('names npx sherlo init as the next step after Logged in as', async () => {
    const { printed } = await runLogin({ api: [start(), APPROVED] });
    const lines = plainLines(printed);

    const loggedIn = lines.findIndex((line) => line.includes(`Logged in as ${EMAIL}`));
    const nextStep = lines.findIndex((line) => line.includes('`npx sherlo init`'));

    expect(loggedIn).toBeGreaterThanOrEqual(0);
    expect(nextStep).toBeGreaterThan(loggedIn);
    expect(lines[nextStep]).toBe(
      'Next: run `npx sherlo init` in your React Native app to set up Sherlo.'
    );
  });

  it('shows a spinner the result replaces on a terminal, and a plain waiting line elsewhere', async () => {
    const onATerminal = await runLogin({ api: [start(), PENDING, APPROVED], terminal: true });

    // The waiting words are drawn by the spinner, on the terminal, never as a line of the
    // transcript...
    expect(plain(onATerminal.terminalWrites)).toContain('Waiting for you to click Authorize...');
    expect(plain(onATerminal.printed)).not.toContain('Waiting for you to click Authorize...');
    // ...and cleared when the wait ends, the cursor given back, before the result is printed.
    const showTheCursor = '\x1b[?25h';
    expect(onATerminal.terminalWrites.endsWith(showTheCursor)).toBe(true);
    expect(onATerminal.clearedLines).toBeGreaterThan(0);
    expect(plain(onATerminal.printed)).toContain(`Logged in as ${EMAIL}`);

    const elsewhere = await runLogin({ api: [start(), PENDING, APPROVED], terminal: false });

    // Off a terminal nothing is drawn: the plain line stays, and tells an agent it may wait in
    // the background.
    expect(elsewhere.terminalWrites).toBe('');
    const lines = plainLines(elsewhere.printed);
    const waiting = lines.indexOf('⏳ Waiting for you to click Authorize... (Ctrl+C to stop)');
    expect(waiting).toBeGreaterThanOrEqual(0);
    expect(lines[waiting + 1]).toContain('in the background');
    expect(plain(elsewhere.printed)).toContain(`Logged in as ${EMAIL}`);
  });
});

/* ========================================================================== */

/**
 * Run `login()` itself on posed seams - with `logins` shared between runs when a case passes them
 * - and answer what it printed through the transcript, what it drew straight on the terminal, how
 * it ended, and the calls the script did not match.
 */
async function runLogin(world: {
  api: ScriptedCall[];
  logins?: SavedLogins;
  clock?: string[];
  terminal?: boolean;
}) {
  const server = posedServerCalls(world.api);
  const surroundings = posedSurroundings({
    env: { SKIP_INTRO: 'true', SHERLO_API_URL: SERVICE_ADDRESS },
    git: 'none',
    clock: world.clock ?? [STARTED],
  });

  const uninstall = [
    installServerCalls(server),
    installBrowser(posedBrowser({ opened: true })),
    installSavedLogins(world.logins ?? posedSavedLogins(undefined)),
    installSurroundings(surroundings),
    surroundings.installSettings(),
  ];
  const terminal = pretendStderrIs(world.terminal ?? false);

  let refusal: string | undefined;
  try {
    const transcript = await captureTranscript(() =>
      login().catch((error: Error) => {
        refusal = plain(error.message);
      })
    );

    return {
      printed: `${transcript.stdout}${transcript.stderr}`,
      terminalWrites: terminal.writes(),
      clearedLines: terminal.clearedLines(),
      refusal,
      unansweredCalls: server.refusals(),
      unusedCalls: server.unusedCalls(),
    };
  } finally {
    terminal.restore();
    for (const undo of uninstall.reverse()) undo();
  }
}

/**
 * The pending login kept under the service address, read at the moment the runs started - an
 * expiry is read by the clock in force, and outside a run that is the wall clock.
 */
function pendingLoginIn(logins: SavedLogins) {
  const uninstall = installSurroundings(
    posedSurroundings({ env: {}, git: 'none', clock: [STARTED] })
  );
  try {
    return logins.readPending(SERVICE_ADDRESS);
  } finally {
    uninstall();
  }
}

/**
 * Make `process.stderr` a terminal or not for one run, and keep what is written straight to it -
 * which is where the spinner draws. A terminal gets the cursor moves a real one has.
 */
function pretendStderrIs(isTerminal: boolean) {
  const stderr = process.stderr as NodeJS.WriteStream;
  const faked = ['isTTY', 'columns', 'write', 'cursorTo', 'clearLine', 'moveCursor'] as const;
  const previous = faked.map((name) => ({
    name,
    descriptor: Object.getOwnPropertyDescriptor(stderr, name),
  }));

  let written = '';
  let clearedLines = 0;
  const fake: Record<(typeof faked)[number], unknown> = {
    isTTY: isTerminal,
    columns: 80,
    write: (chunk: unknown) => {
      written += String(chunk);
      return true;
    },
    cursorTo: () => true,
    clearLine: () => {
      clearedLines += 1;
      return true;
    },
    moveCursor: () => true,
  };
  for (const name of faked) {
    Object.defineProperty(stderr, name, { value: fake[name], configurable: true, writable: true });
  }

  return {
    writes: () => written,
    clearedLines: () => clearedLines,
    restore: () => {
      for (const { name, descriptor } of previous) {
        if (descriptor) Object.defineProperty(stderr, name, descriptor);
        else delete (stderr as unknown as Record<string, unknown>)[name];
      }
    },
  };
}

/** Text with its colour taken off, for a case about words rather than styling. */
function plain(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

function plainLines(text: string): string[] {
  return plain(text).split('\n');
}
