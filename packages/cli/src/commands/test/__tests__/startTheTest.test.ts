/**
 * Tests for ../startTheTest - the open, the Started row and the ending the staged and sim roads
 * share. What they print, compared road against road, is ./simRun.printout.test.ts; this file pins
 * what the open sends and how an error at the open is answered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openBuild: vi.fn(),
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
  serverCalls: () => ({ openBuild: mocks.openBuild }),
}));
vi.mock('../closeTheRun', () => ({ closeTheRun: vi.fn() }));

import { openAndEndTheTest } from '../startTheTest';

/** One android test opened alone, whose module map holds one file of three stories. */
function openOneTest(refusedAtOpen?: (error: unknown) => Promise<{ url: string }> | undefined) {
  return openAndEndTheTest({
    passedOptions: {} as any,
    commandParams: {
      credential: { token: 't', projectIndex: 3, teamId: 'team' },
      devices: [],
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

  it("an error the road answers at the open ends the push on the road's answer", async () => {
    mocks.openBuild.mockRejectedValue(new Error('gate refused'));

    await expect(openOneTest(() => Promise.resolve({ url: 'built' }))).resolves.toEqual({
      url: 'built',
    });
    expect(mocks.handleClientError).not.toHaveBeenCalled();
  });

  it('an error the road does not answer is the client error it is', async () => {
    mocks.openBuild.mockRejectedValue(new Error('network down'));

    await expect(openOneTest(() => undefined)).rejects.toThrow('network down');
    expect(mocks.handleClientError).toHaveBeenCalled();
  });
});
