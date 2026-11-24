/**
 * Tests for ../startTheTest - the open, the Started row and the ending the staged and sim roads
 * share. What they print, compared road against road, is ./simRun.printout.test.ts; this file pins
 * what the open sends and how an error at the open is answered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openBuild: vi.fn(),
  getBuildStatus: vi.fn(),
  handleClientError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../../../helpers', () => ({
  getAppBuildUrl: vi.fn(() => 'http://app/build'),
  handleClientError: mocks.handleClientError,
  reporting: { setTag: vi.fn() },
}));
vi.mock('../../../seams/serverCalls', () => ({
  serverCalls: () => ({ openBuild: mocks.openBuild, getBuildStatus: mocks.getBuildStatus }),
}));
vi.mock('../closeTheRun', () => ({ closeTheRun: vi.fn() }));
vi.mock('../../../seams/surroundings', () => ({
  surroundings: () => ({ sleep: () => Promise.resolve() }),
}));

/** The status answer of a test whose quick check cleared every story, in the run state given. */
function clearedAnswer(runStatus: string) {
  return {
    runStatus,
    platforms: {
      android: {
        capture: { quickCheck: 'FINISHED', storiesChecked: 3, storiesCaptured: 0, full: false },
      },
    },
  };
}

import { closeTheRun } from '../closeTheRun';
import { openAndEndTheTest } from '../startTheTest';

/** One android test opened alone, whose module map holds one file of three stories. */
function openOneTest(refusedAtOpen?: (error: unknown) => Promise<{ url: string }> | undefined) {
  return openAndEndTheTest({
    passedOptions: {} as any,
    commandParams: {
      credential: { token: 't', projectIndex: 3, teamId: 'team' },
      devices: [],
      projectRoot: '/no/such/app',
    } as any,
    platformsToTest: ['android'],
    joinKey: null,
    request: { teamId: 'team', projectIndex: 3 } as any,
    moduleManifests: {
      android: {
        raw: Buffer.from('{}'),
        parsed: {
          version: 1,
          header: {},
          moduleHashes: {},
          storyClosures: { 'src/A.stories.tsx': [] },
          storyCounts: { 'src/A.stories.tsx': 3 },
        },
      },
    },
    platformRows: [],
    refusedAtOpen,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('opening the test', () => {
  it("sends the module maps' story counts as the push facts", async () => {
    mocks.openBuild.mockResolvedValue({ build: { index: 4 }, buildRun: { config: {} } });

    await expect(openOneTest()).resolves.toEqual({ url: 'http://app/build' });

    expect(mocks.openBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        pushFacts: expect.objectContaining({ platforms: { android: { storiesInBundle: 3 } } }),
      })
    );
  });

  it('a first push sends no list of story files for the service to narrow to', async () => {
    mocks.openBuild.mockResolvedValue({ build: { index: 4 }, buildRun: { config: {} } });

    await openOneTest();

    expect(mocks.openBuild).toHaveBeenCalledTimes(1);
    expect(mocks.openBuild.mock.calls[0][0]).not.toHaveProperty('firstLook');
  });

  it('the test command takes no flag that asks for every story', async () => {
    vi.doUnmock('../../../helpers');
    vi.doUnmock('../../../seams/serverCalls');
    vi.doUnmock('../closeTheRun');
    vi.doUnmock('../../../seams/surroundings');
    vi.resetModules();
    const { default: start } = await import('../../../start');
    const originalArgv = process.argv;
    let help = '';
    vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array,
      done?: () => void
    ) => {
      help += String(chunk);
      done?.();
      return true;
    }) as never);
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    process.argv = ['node', 'sherlo', 'test', '--help'];
    await start().catch(() => undefined);
    process.argv = originalArgv;

    expect(help).toContain('Usage: sherlo test');
    expect(help).not.toMatch(/all-stories|every story/i);
  });

  it("an error the road answers at the open ends the push on the road's answer", async () => {
    mocks.openBuild.mockRejectedValue(new Error('gate refused'));

    await expect(openOneTest(() => Promise.resolve({ url: 'built' }))).resolves.toEqual({
      url: 'built',
    });
    expect(mocks.handleClientError).not.toHaveBeenCalled();
  });

  it('a push whose quick check clears every story prints Finished: nothing to test', async () => {
    mocks.openBuild.mockResolvedValue({
      build: { index: 4, diffScopeInfo: { platforms: { android: { quickCheck: 'RUNNING' } } } },
      buildRun: { config: {} },
    });
    // The check answers cleared while the server has not closed the test yet; a later read finds it closed.
    mocks.getBuildStatus
      .mockResolvedValueOnce(clearedAnswer('queued'))
      .mockResolvedValue(clearedAnswer('finished'));

    await openOneTest();

    expect(mocks.getBuildStatus).toHaveBeenCalledTimes(2);
    expect(closeTheRun).toHaveBeenCalledWith(expect.objectContaining({ serverBypassed: true }));
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Started'));
  });

  it('a push whose quick check clears every story before the service closes the test prints Finished: nothing to test', async () => {
    mocks.openBuild.mockResolvedValue({
      build: { index: 4, diffScopeInfo: { platforms: { android: { quickCheck: 'RUNNING' } } } },
      buildRun: { config: {} },
    });
    // The service closes the test some asks after the check finished; the status reads inProgress meanwhile.
    mocks.getBuildStatus
      .mockResolvedValueOnce(clearedAnswer('inProgress'))
      .mockResolvedValueOnce(clearedAnswer('inProgress'))
      .mockResolvedValue(clearedAnswer('finished'));

    await openOneTest();

    expect(mocks.getBuildStatus).toHaveBeenCalledTimes(3);
    expect(closeTheRun).toHaveBeenCalledWith(expect.objectContaining({ serverBypassed: true }));
  });

  it('a push whose quick check clears every story but the server leaves the test open prints Started', async () => {
    mocks.openBuild.mockResolvedValue({
      build: { index: 4, diffScopeInfo: { platforms: { android: { quickCheck: 'RUNNING' } } } },
      buildRun: { config: {} },
    });
    mocks.getBuildStatus.mockResolvedValue(clearedAnswer('inProgress'));

    await openOneTest();

    expect(closeTheRun).toHaveBeenCalledWith(expect.objectContaining({ serverBypassed: false }));
  });

  it('a push whose quick check leaves a story to capture is a started test', async () => {
    mocks.openBuild.mockResolvedValue({
      build: { index: 4, diffScopeInfo: { platforms: { android: { quickCheck: 'RUNNING' } } } },
      buildRun: { config: {} },
    });
    mocks.getBuildStatus.mockResolvedValue({
      platforms: {
        android: { capture: { quickCheck: 'FINISHED', storiesCaptured: 2, full: false } },
      },
    });

    await openOneTest();

    expect(closeTheRun).toHaveBeenCalledWith(expect.objectContaining({ serverBypassed: false }));
  });

  it('an error the road does not answer is the client error it is', async () => {
    mocks.openBuild.mockRejectedValue(new Error('network down'));

    await expect(openOneTest(() => undefined)).rejects.toThrow('network down');
    expect(mocks.handleClientError).toHaveBeenCalled();
  });
});
