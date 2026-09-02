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
 * the outside world are: the build read and the wait loop. `getTokenParts`,
 * `getAppBuildUrl`, `parseWaitTimeout` and `throwError` stay real, so the cases
 * below are asserting that the command SPLITS the token, COMPOSES the URL and
 * PARSES the timeout, rather than that it was handed all three.
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
  return { ...actual, default: vi.fn(), readBuildStatus: vi.fn() };
});

// ---------------------------------------------------------------------------
// Mocked dependency accessors
// ---------------------------------------------------------------------------

import _getValidatedCommandParams from '../../../helpers/getValidatedCommandParams';
import _waitForBuildResult, {
  readBuildStatus as _readBuildStatus,
} from '../../../helpers/waitForBuildResult';
import view from '../view';

const getValidatedCommandParams = vi.mocked(_getValidatedCommandParams);
const waitForBuildResult = vi.mocked(_waitForBuildResult);
const readBuildStatus = vi.mocked(_readBuildStatus);

/**
 * A token of the real fixed-width layout `getTokenParts` slices: the api token,
 * then the eight-character team id, then the project index.
 */
const TEAM_ID = 'tm000001';
const PROJECT_INDEX = 7;
const TOKEN = `${'s'.repeat(PROJECT_API_TOKEN_LENGTH)}${TEAM_ID}${PROJECT_INDEX}`;

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
  // The real resolution has its own suite; what matters here is that the
  // command works from the params it is GIVEN, options included.
  getValidatedCommandParams
    .mockReset()
    .mockImplementation(
      ({ passedOptions }) => ({ ...passedOptions, token: TOKEN, devices: [] } as never)
    );

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCodes.push(code);
    throw new ExitSignal(code);
  }) as never);
  process.env.SKIP_INTRO = 'true';
});

afterEach(() => {
  vi.restoreAllMocks();
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

    await expect(runView('99')).rejects.toThrow(/Build #99 does not exist/);
  });

  it('lets a failed read out, instead of reporting all is well', async () => {
    // The read IS the command's answer. A `view` that swallowed a refused
    // credential would print nothing and exit 0.
    readBuildStatus.mockRejectedValue(new Error('Authentication failed (HTTP 401)'));

    await expect(runView('7')).rejects.toThrow(/Authentication failed/);
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

describe('--metadata', () => {
  it('asks the wait loop for the block only when the flag is passed', async () => {
    await runView('7', { wait: true });
    expect(waitForBuildResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ metadata: undefined })
    );

    await runView('7', { wait: true, metadata: true });
    expect(waitForBuildResult).toHaveBeenLastCalledWith(expect.objectContaining({ metadata: {} }));
  });

  it('hands the loop NO git, because this command did not open the build', async () => {
    // Reading local git here would describe whatever commit is checked out,
    // which is not the one the build was made from.
    await runView('7', { wait: true, metadata: true });

    const lastCall = waitForBuildResult.mock.lastCall as [{ metadata?: { git?: unknown } }];
    expect(lastCall[0].metadata?.git).toBeUndefined();
  });
});
