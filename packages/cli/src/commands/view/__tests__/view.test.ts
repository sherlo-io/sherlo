/**
 * `sherlo view` AS A COMMAND - which build it looks at, what it refuses, and
 * what its exit code means.
 *
 * What it PRINTS is covered next door (./viewTranscripts.test.ts) by rendering
 * the shipped print path over a scripted read. This file covers the half that
 * happens before and after that: resolving the build, refusing an invocation it
 * cannot serve, and the exit-code split that makes `--wait` the CI form of the
 * command and the bare form a read.
 *
 * WHAT IS STUBBED, AND WHAT IS DELIBERATELY NOT. Only the two things that reach
 * the outside world are: the build read and the wait loop. The credential is
 * resolved by the real resolver from the flags, the settings and the config each
 * case states, and `getAppBuildUrl`, `parseWaitTimeout` and `throwError` stay
 * real, so the cases below are asserting that the command reads the build in the
 * project its credential names, COMPOSES the URL and PARSES the timeout, rather
 * than that it was handed all three.
 */
import { PROJECT_API_TOKEN_LENGTH } from '@sherlo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest above all imports)
// ---------------------------------------------------------------------------

vi.mock('../../../helpers/reporting', () => ({
  default: {
    init: vi.fn(),
    setContext: vi.fn(),
    setTag: vi.fn(),
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../../helpers/getValidatedCommandParams', () => ({ default: vi.fn() }));

// The read and the loop are the command's only two effects. Everything else in
// this module - the wire shape, the exit codes - stays real.
vi.mock('../../../helpers/waitForBuildResult', async (importActual) => {
  const actual = await importActual<typeof import('../../../helpers/waitForBuildResult')>();
  return { ...actual, default: vi.fn(), waitForTest: vi.fn(), readBuildStatus: vi.fn() };
});

// ---------------------------------------------------------------------------
// Mocked dependency accessors
// ---------------------------------------------------------------------------

import _getValidatedCommandParams from '../../../helpers/getValidatedCommandParams';
import _waitForBuildResult, {
  readBuildStatus as _readBuildStatus,
  waitForTest as _waitForTest,
} from '../../../helpers/waitForBuildResult';
import resolvePushCredential from '../../../helpers/getValidatedCommandParams/validateCommandParams/resolvePushCredential';
import { installSavedLogins, posedSavedLogins } from '../../../seams/savedLogins';
import view from '../view';

const getValidatedCommandParams = vi.mocked(_getValidatedCommandParams);
const waitForBuildResult = vi.mocked(_waitForBuildResult);
const waitForTest = vi.mocked(_waitForTest);
const readBuildStatus = vi.mocked(_readBuildStatus);

/**
 * A token of the real fixed-width layout `getTokenParts` slices: the api token,
 * then the eight-character team id, then the project index.
 */
const TEAM_ID = 'tm000001';
const PROJECT_INDEX = 7;
const TOKEN = `${'s'.repeat(PROJECT_API_TOKEN_LENGTH)}${TEAM_ID}${PROJECT_INDEX}`;

/**
 * What the config file holds, per case. The project token is always in
 * SHERLO_TOKEN - most cases read a build on it - and a case that spends a
 * person's credential empties it.
 */
let configOfThisCase: Record<string, unknown> = {};

/** A finished build with nothing to review - the shape most cases here reuse. */
const FINISHED_BUILD = {
  runStatus: 'finished' as const,
  status: 'noChanges' as const,
  viewStatusesCount: { approved: 0, noChanges: 44, reported: 0, unreviewed: 0 },
};

class ExitSignal extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

let exitCodes: (number | undefined)[];

beforeEach(() => {
  exitCodes = [];
  readBuildStatus.mockReset().mockResolvedValue(FINISHED_BUILD);
  waitForBuildResult.mockReset().mockResolvedValue(0);
  // The config file and the devices have their own suites; what matters here is
  // that the command works from the params it is GIVEN, options included, and
  // spends the credential the real resolver answers for them.
  getValidatedCommandParams.mockReset().mockImplementation(async ({ command, passedOptions }) => {
    const config = { ...configOfThisCase };
    const credential = await resolvePushCredential(command, config);
    return { ...config, ...passedOptions, credential, devices: [] } as never;
  });
  configOfThisCase = {};
  // The machine running this suite may hold a project token of its own; every case states its own.
  vi.stubEnv('SHERLO_TOKEN', TOKEN);
  // GitHub Actions sends credential resolution down the ID-token road; these cases mean the saved login.
  vi.stubEnv('GITHUB_ACTIONS', '');
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', '');
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', '');

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCodes.push(code);
    throw new ExitSignal(code);
  }) as never);
  process.env.SKIP_INTRO = 'true';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete process.env.SKIP_INTRO;
});

/** Run the command, letting the intentional `process.exit` of `--wait` settle. */
async function runView(
  buildArgument: string | undefined,
  options: Record<string, unknown> = {}
): Promise<void> {
  await view(buildArgument, options as never).catch((error) => {
    if (!(error instanceof ExitSignal)) throw error;
  });
}

describe('which build `sherlo view` looks at', () => {
  it('reads the build the argument names, off ids it split out of the token', async () => {
    await runView('7');

    expect(readBuildStatus).toHaveBeenCalledWith(
      expect.objectContaining({ buildIndex: 7, projectIndex: PROJECT_INDEX, teamId: TEAM_ID })
    );
  });

  it("reads the build in the config's project when it spends a person's credential", async () => {
    // No project token anywhere: the config names the project, and the login's token is sent
    // whole - it has no team or project in it to split out.
    configOfThisCase = { project: 'k3j9x2ab/4' };
    vi.stubEnv('SHERLO_TOKEN', '');
    const serviceAddress = 'https://api.sherlo.io/graphql';
    const loginToken = 'sht_viewlogintoken0000000000000000';
    vi.stubEnv('SHERLO_API_URL', serviceAddress);
    const uninstallLogins = installSavedLogins(
      posedSavedLogins({ [serviceAddress]: { email: 'anna@example.com', token: loginToken } })
    );

    try {
      await runView('7');
    } finally {
      uninstallLogins();
    }

    expect(readBuildStatus).toHaveBeenCalledWith({
      token: loginToken,
      buildIndex: 7,
      projectIndex: 4,
      teamId: 'k3j9x2ab',
    });
  });

  it('refuses with no argument, and says why there is no default', async () => {
    // The refusal is the product: no read a project token can make names a
    // project's latest build, so the command asks rather than guesses.
    await expect(runView(undefined)).rejects.toThrow(/needs the build to look at/);
    expect(readBuildStatus).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-3', '2.5', ''])('refuses "%s" as a build index', async (argument) => {
    await expect(runView(argument)).rejects.toThrow(/not a build index/);
    expect(readBuildStatus).not.toHaveBeenCalled();
  });

  it('refuses a build that does not exist rather than printing an empty view', async () => {
    readBuildStatus.mockResolvedValue(null);

    await expect(runView('99')).rejects.toThrow(/Test 99 does not exist/);
  });

  it('lets a failed read out, instead of reporting all is well', async () => {
    // The read IS the command's answer. A `view` that swallowed a refused
    // credential would print nothing and exit 0.
    readBuildStatus.mockRejectedValue(new Error('Authentication failed (HTTP 401)'));

    await expect(runView('7')).rejects.toThrow(/Authentication failed/);
  });
});

describe('the eager read racing the build it names', () => {
  // `sherlo view <index> --wait` is meant to be chainable straight after
  // whatever opened that build - a CI run that pushes, builds, and only then
  // calls `sherlo test`. Minutes can separate that push from the build
  // existing at Sherlo, so a single miss on THIS read says nothing about
  // whether the index is real: only a caller who did not ask to wait treats
  // a miss as final.
  it('hands a `--wait` miss straight to the wait loop instead of refusing', async () => {
    readBuildStatus.mockResolvedValue(null);
    waitForBuildResult.mockResolvedValue(0);

    await runView('7', { wait: true });

    expect(waitForBuildResult).toHaveBeenCalledWith(
      expect.objectContaining({ buildIndex: 7, projectIndex: PROJECT_INDEX, teamId: TEAM_ID })
    );
    expect(exitCodes, 'the wait loop is the one thing that can still refuse this').toEqual([0]);
  });

  it('gives a miss no second chance without `--wait`', async () => {
    readBuildStatus.mockResolvedValueOnce(null);

    await expect(runView('99')).rejects.toThrow(/Test 99 does not exist/);
    expect(
      waitForBuildResult,
      'a bare read never falls back to the wait loop'
    ).not.toHaveBeenCalled();
  });
});

describe('the exit-code split', () => {
  it('without --wait it does not wait, and does not exit on the verdict', async () => {
    await runView('7');

    expect(waitForBuildResult).not.toHaveBeenCalled();
    expect(exitCodes, 'a read reports a verdict; it does not gate on one').toEqual([]);
  });

  it.each([0, 1, 2, 3, 130])(
    'with --wait it carries exit code %i straight through',
    async (code) => {
      waitForBuildResult.mockResolvedValue(code);

      await runView('7', { wait: true });

      expect(exitCodes).toEqual([code]);
    }
  );

  it('passes --wait-timeout on to the loop, and drops an unusable one', async () => {
    await runView('7', { wait: true, waitTimeout: '10' });
    expect(waitForBuildResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ waitTimeoutMinutes: 10 })
    );

    await runView('7', { wait: true, waitTimeout: 'soon' });
    expect(
      waitForBuildResult,
      'an unparseable timeout must fall back to the loop own default, never to zero'
    ).toHaveBeenLastCalledWith(expect.objectContaining({ waitTimeoutMinutes: undefined }));
  });
});

describe('--json --wait', () => {
  it('waits, then prints only the record read after the wait, and exits with the wait code', async () => {
    for (const code of [0, 1, 3]) {
      exitCodes = [];
      vi.mocked(console.log).mockClear();
      readBuildStatus.mockReset().mockResolvedValue({ runStatus: 'inProgress' } as never);
      waitForTest.mockReset().mockResolvedValue({ exitCode: code, lastRead: FINISHED_BUILD });

      await runView('7', { wait: true, json: true });

      expect(
        waitForTest,
        'the JSON wait is the loop in json mode, not a captured human one'
      ).toHaveBeenLastCalledWith(expect.objectContaining({ json: true, buildIndex: 7 }));
      expect(
        readBuildStatus,
        "the record is the wait's last read: only the first read"
      ).toHaveBeenCalledTimes(1);
      const printed = vi.mocked(console.log).mock.calls.map((call) => call.join(' '));
      expect(printed, 'stdout carries the record alone').toHaveLength(1);
      expect(JSON.parse(printed[0])).toMatchObject({ runStatus: 'finished', buildIndex: 7 });
      expect(exitCodes).toEqual([code]);
    }
  });

  it('prints no record when the test never appeared, and still exits with the wait code', async () => {
    waitForTest.mockReset().mockResolvedValue({ exitCode: 3, lastRead: null });

    await runView('7', { wait: true, json: true });

    expect(vi.mocked(console.log)).not.toHaveBeenCalled();
    expect(exitCodes).toEqual([3]);
  });
});

describe('--wait', () => {
  it('never asks the wait loop for a details block - `view` reads a build back with `--json`', async () => {
    await runView('7', { wait: true });

    const lastCall = waitForBuildResult.mock.lastCall as [Record<string, unknown>];
    expect(lastCall[0]).not.toHaveProperty('metadata');
  });
});
