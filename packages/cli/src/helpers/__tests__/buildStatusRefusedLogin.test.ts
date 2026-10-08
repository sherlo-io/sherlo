/**
 * A REFUSED SAVED LOGIN WHILE WAITING (sherlo / Logging in from the terminal, "When does a login
 * stop working?").
 *
 * `sherlo test --wait` and `sherlo view --wait` read the build until it ends. When the service
 * refuses the credential at that point, a saved login is answered the way every command answers
 * it - log in again - and a token somebody gave keeps "check your token". The wait loop is run
 * with a poll that refuses the way the real read does, by throwing its AuthError.
 */
import chalk from 'chalk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '../buildStatusRequest';
import { EXIT_ERROR } from '../exitCodes';
import waitForBuildResult from '../waitForBuildResult';

chalk.level = 0;

const REFUSAL_OF_THE_READ = 'Authentication failed (HTTP 401) - check your token';

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
});

/** What the wait prints and the exit code it ends with, when the service refuses the token. */
async function waitOnARefusedToken(fromSavedLogin: boolean) {
  const exitCode = await waitForBuildResult({
    token: 'sht_savedlogintoken0000000000000000',
    fromSavedLogin,
    buildIndex: 12,
    projectIndex: 4,
    teamId: 'k3j9x2ab',
    pollBuildStatus: async () => {
      throw new AuthError(REFUSAL_OF_THE_READ);
    },
  });
  const printed = logSpy.mock.calls.map((call: unknown[]) => call[0] ?? '').join('\n');
  return { exitCode, printed };
}

describe('a refused credential while waiting', () => {
  it('answers a refused saved login while waiting by naming sherlo login', async () => {
    const onTheLogin = await waitOnARefusedToken(true);

    expect(onTheLogin.exitCode).toBe(EXIT_ERROR);
    expect(onTheLogin.printed).toContain(
      'Sherlo no longer accepts the login saved on this computer.'
    );
    expect(onTheLogin.printed).toContain('Run `npx sherlo login` to log in again.');
    expect(onTheLogin.printed).not.toContain('check your token');

    logSpy.mockClear();

    // A token somebody gave on purpose is not a login, and keeps the read's own refusal.
    const onAGivenToken = await waitOnARefusedToken(false);

    expect(onAGivenToken.exitCode).toBe(EXIT_ERROR);
    expect(onAGivenToken.printed).toContain(REFUSAL_OF_THE_READ);
    expect(onAGivenToken.printed).not.toContain('sherlo login');
  });
});
