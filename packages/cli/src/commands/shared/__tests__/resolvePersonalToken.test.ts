/**
 * THE PERSONAL TOKEN THE FOUR MANAGEMENT COMMANDS SPEND (sherlo / Teams, projects and the personal
 * token, "Which credential goes where?").
 *
 * Each case states the settings and the logins saved on this computer through the seams a posed run
 * uses, so nothing on the machine running this suite can answer for it.
 */
import { describe, expect, it } from 'vitest';
import { installSavedLogins, PosedLogins, posedSavedLogins } from '../../../seams/savedLogins';
import { installSurroundings, posedSurroundings } from '../../../seams/surroundings';
import resolvePersonalToken, { ResolvedPersonalToken } from '../resolvePersonalToken';

const SERVICE_ADDRESS = 'https://api.sherlo.io/graphql';
const TOKEN_ON_THE_FLAG = 'sht_flagpersonaltoken0000000000000';
const TOKEN_IN_THE_VARIABLE = 'sht_variablepersonaltoken000000000';
const SAVED_LOGIN_TOKEN = 'sht_savedlogintoken0000000000000000';

/** Resolve the personal token `sherlo team list` spends, in the world a case states. */
function resolveIn({
  flag,
  env = {},
  loggedIn = false,
}: {
  flag?: string;
  env?: Record<string, string>;
  loggedIn?: boolean;
}): ResolvedPersonalToken {
  const surroundings = posedSurroundings({
    env: { SHERLO_API_URL: SERVICE_ADDRESS, ...env },
    git: 'none',
  });
  const logins: PosedLogins = loggedIn
    ? { [SERVICE_ADDRESS]: { email: 'anna@example.com', token: SAVED_LOGIN_TOKEN } }
    : {};

  const uninstall = [
    installSavedLogins(posedSavedLogins(logins)),
    installSurroundings(surroundings),
    surroundings.installSettings(),
  ];

  try {
    return resolvePersonalToken(flag, {
      thisCommand: 'team list',
      tokenContextLine:
        'The project token names one project, and this command lists the teams you belong to.',
    });
  } finally {
    for (const undo of uninstall.reverse()) undo();
  }
}

describe('which personal token a management command spends', () => {
  it('spends --personal-token, then SHERLO_PERSONAL_TOKEN, then the saved login', () => {
    const everyCredential = {
      flag: TOKEN_ON_THE_FLAG,
      env: { SHERLO_PERSONAL_TOKEN: TOKEN_IN_THE_VARIABLE },
      loggedIn: true,
    };

    // A token given on purpose always beats the login.
    expect(resolveIn(everyCredential)).toEqual({
      personalToken: TOKEN_ON_THE_FLAG,
      fromSavedLogin: false,
    });

    expect(resolveIn({ ...everyCredential, flag: undefined })).toEqual({
      personalToken: TOKEN_IN_THE_VARIABLE,
      fromSavedLogin: false,
    });

    expect(resolveIn({ loggedIn: true })).toEqual({
      personalToken: SAVED_LOGIN_TOKEN,
      fromSavedLogin: true,
    });
  });

  it('refuses with no personal token and no saved login, naming sherlo login', () => {
    let refusal = '';
    try {
      resolveIn({});
    } catch (error) {
      refusal = (error as Error).message;
    }

    // `sherlo login` first, then the flag and the variable.
    expect(refusal).toContain(
      'AUTH ERROR: `sherlo team list` needs you to be logged in. Run `sherlo login`.\n' +
        '  Or pass a personal token with `--personal-token` or SHERLO_PERSONAL_TOKEN.'
    );
  });
});
