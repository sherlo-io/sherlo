import { beforeEach, describe, expect, it, vi } from 'vitest';
import builds from '../builds';
import config from '../config';
import dependencies from '../dependencies';
import init from '../init';
import metroConfig from '../metroConfig';
import project from '../project';
import storybookAccess from '../storybookAccess';
import testing from '../testing';

let scenesFlag: 'on' | 'off' | undefined;

vi.mock('../../../helpers', async (importActual) => ({
  ...(await importActual<typeof import('../../../helpers')>()),
  printSherloIntro: vi.fn(),
}));
vi.mock('../../../seams/workstation', () => ({
  workstation: () => ({ scenesFlag: () => scenesFlag, askScenesFlag: async () => {} }),
}));
vi.mock('../helpers', async (importActual) => ({
  ...(await importActual<typeof import('../helpers')>()),
  trackProgress: vi.fn(async () => ({ sessionId: null })),
}));
vi.mock('../requirements', async (importActual) => ({
  ...(await importActual<typeof import('../requirements')>()),
  default: vi.fn(async () => ({ appHasStorybook: false })),
}));
vi.mock('../project', () => ({ default: vi.fn() }));
vi.mock('../dependencies', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../metroConfig', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../storybookAccess', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../config', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../builds', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../testing', () => ({ default: vi.fn(async () => {}) }));

/** What the project step did: it asks the run whether to go on, then makes a project. */
const madeProjects: string[] = [];

describe('setup for an app with no Storybook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    madeProjects.length = 0;
    vi.mocked(project).mockImplementation(async (_options, beforeAnythingIsMade) => {
      await beforeAnythingIsMade?.('k3j9x2ab');
      madeProjects.push('k3j9x2ab/1');
      return 'k3j9x2ab/1';
    });
  });

  it('with scenes off, the run is refused before any project is made and nothing is installed or changed', async () => {
    scenesFlag = 'off';

    await expect(init({} as Parameters<typeof init>[0])).rejects.toThrow(
      'Set up Storybook before initializing Sherlo'
    );

    expect(madeProjects).toEqual([]);
    for (const step of [dependencies, metroConfig, storybookAccess, config, builds, testing]) {
      expect(step).not.toHaveBeenCalled();
    }
  });

  it('with scenes on, setup installs the SDK and skips the metro config and Storybook Access steps', async () => {
    scenesFlag = 'on';

    await init({} as Parameters<typeof init>[0]);

    expect(madeProjects).toEqual(['k3j9x2ab/1']);
    expect(dependencies).toHaveBeenCalledTimes(1);
    expect(metroConfig).not.toHaveBeenCalled();
    expect(storybookAccess).not.toHaveBeenCalled();
    expect(config).toHaveBeenCalledTimes(1);
  });
});
