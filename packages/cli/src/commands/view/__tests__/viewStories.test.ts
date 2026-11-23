/**
 * `sherlo view` AND THE LIST OF STORIES - read for `--json` only, after the wait when there is
 * one, and a list that is not whole says so in the exit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../helpers/reporting', () => ({
  default: {
    init: vi.fn(),
    setContext: vi.fn(),
    setTag: vi.fn(),
    flush: vi.fn().mockResolvedValue(true),
  },
}));
vi.mock('../../../helpers/getValidatedCommandParams', () => ({ default: vi.fn() }));
vi.mock('../../../helpers/waitForBuildResult', async (importActual) => {
  const actual = await importActual<typeof import('../../../helpers/waitForBuildResult')>();
  return { ...actual, default: vi.fn(), waitForTest: vi.fn(), readBuildStatus: vi.fn() };
});

import _getValidatedCommandParams from '../../../helpers/getValidatedCommandParams';
import {
  readBuildStatus as _readBuildStatus,
  waitForTest as _waitForTest,
} from '../../../helpers/waitForBuildResult';
import { installServerCalls, type ServerCalls } from '../../../seams/serverCalls';
import {
  FINISHED_TEST_ON_IOS,
  WHOLE_PAGE,
} from '../../../helpers/__tests__/support/storiesDiffScopeFixture';
import view from '../view';

const getValidatedCommandParams = vi.mocked(_getValidatedCommandParams);
const readBuildStatus = vi.mocked(_readBuildStatus);
const waitForTest = vi.mocked(_waitForTest);

class ExitSignal extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

let getStoriesDiffScope: ReturnType<typeof vi.fn>;
let uninstall: () => void;
let exitCodes: (number | undefined)[];

beforeEach(() => {
  exitCodes = [];
  getStoriesDiffScope = vi.fn().mockResolvedValue(WHOLE_PAGE);
  uninstall = installServerCalls({ getStoriesDiffScope } as unknown as ServerCalls);
  readBuildStatus.mockReset().mockResolvedValue(FINISHED_TEST_ON_IOS);
  getValidatedCommandParams.mockReset().mockImplementation(
    async ({ passedOptions }) =>
      ({
        ...passedOptions,
        credential: { kind: 'project', token: 'tok', projectIndex: 1, teamId: 'tm000001' },
      }) as never
  );
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCodes.push(code);
    throw new ExitSignal(code);
  }) as never);
  process.env.SKIP_INTRO = 'true';
});

afterEach(() => {
  uninstall();
  vi.restoreAllMocks();
  process.exitCode = undefined;
  delete process.env.SKIP_INTRO;
});

async function runView(options: Record<string, unknown>): Promise<void> {
  await view('7', options as never).catch((error) => {
    if (!(error instanceof ExitSignal)) throw error;
  });
}

function printedJson(): { platforms: { ios: Record<string, unknown> } } {
  return JSON.parse(vi.mocked(console.log).mock.calls.map((call) => call.join(' '))[0]);
}

describe('sherlo view and the list of stories', () => {
  it('reads the list for --json and prints it under the platform', async () => {
    await runView({ json: true });

    expect(printedJson().platforms.ios.diffScopeStories).toEqual(WHOLE_PAGE.stories);
    expect(process.exitCode).toBeUndefined();
  });

  it('reads no list without --json', async () => {
    await runView({});

    expect(getStoriesDiffScope).not.toHaveBeenCalled();
  });

  it('reads the list after the wait and exits with the wait code', async () => {
    waitForTest.mockReset().mockResolvedValue({ exitCode: 0, lastRead: FINISHED_TEST_ON_IOS });

    await runView({ json: true, wait: true });

    expect(waitForTest).toHaveBeenCalledTimes(1);
    expect(waitForTest.mock.invocationCallOrder[0]).toBeLessThan(
      getStoriesDiffScope.mock.invocationCallOrder[0]
    );
    expect(printedJson().platforms.ios.diffScopeStories).toEqual(WHOLE_PAGE.stories);
    expect(exitCodes).toEqual([0]);
  });

  it('prints the JSON and exits with an error when a list is not whole', async () => {
    getStoriesDiffScope.mockRejectedValue(new Error('HTTP 500: Internal Server Error'));

    await runView({ json: true });

    expect(printedJson().platforms.ios.diffScopeStoriesIncomplete).toBe(
      'HTTP 500: Internal Server Error'
    );
    expect(process.exitCode).toBe(2);
  });

  it('prints no list and no error when the team has no Diff Scope viewer', async () => {
    getStoriesDiffScope.mockResolvedValue(null);

    await runView({ json: true });

    const ios = printedJson().platforms.ios;
    expect(ios.diffScopeStories).toBeUndefined();
    expect(ios.diffScopeStoriesNotAvailable).toBe('the team has no Diff Scope viewer');
    expect(process.exitCode).toBeUndefined();
  });
});
