import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildBundles: vi.fn(),
  uploadBundles: vi.fn(),
}));

vi.mock('../../bundleAndPreview', () => ({ buildBundles: mocks.buildBundles }));
vi.mock('../../uploadBundles', () => ({
  uploadBundles: mocks.uploadBundles,
  realBundleUploadEffects: vi.fn(),
}));
vi.mock('../../suppliedBundle', () => ({ resolveSuppliedBundles: vi.fn() }));
vi.mock('../../../../seams/bundler', () => ({
  bundler: () => ({ bundleFor: vi.fn(), gateMetadataFor: vi.fn() }),
}));

import { uploadFreshBundles } from '../../../../helpers/uploadFreshBundles';
import { captureTranscript } from '../../../../helpers/transcriptSink';
import waitForBuildResult, { readBuildScreenKind } from '../../../../helpers/waitForBuildResult';
import { renderVerdictPassed } from '../../../../render/verdictCloser';
import {
  countBundleScenes,
  countBundleStories,
  countStoriesIn,
  titledStoryFilesIn,
  validateModuleManifestBuffer,
} from '../../readModuleManifest';
import { describeWhatRuns } from '../../../../render/testSteps';
import { capturePerPlatform } from '../../capturePerPlatform';
import { pushFactsOf } from '../pushFacts';

/**
 * A module map as the serializer writes it, holding the given scenes and story files: a scene
 * file is a key of `storyClosures` beside them.
 */
function moduleMapHolding(sceneIds: string[], storyFiles: string[] = []) {
  const storyClosures = Object.fromEntries(
    [...storyFiles, './src/Inbox.scenes.tsx'].map((file) => [file, []])
  );
  const manifest = validateModuleManifestBuffer(
    Buffer.from(
      JSON.stringify({ version: 1, header: {}, moduleHashes: {}, storyClosures, sceneIds })
    )
  );
  return manifest!;
}

const EFFECTS = {
  bundling: { bundleFor: vi.fn(), gateMetadataFor: vi.fn() },
  upload: { requestUploadSlots: vi.fn(), uploadBundle: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mocks.uploadBundles.mockResolvedValue({ android: { jsBundleS3Key: 'js' } });
});

describe('a push counts scenes beside stories', () => {
  it("the push counts scenes from the build's module map", () => {
    const moduleMap = moduleMapHolding(['inbox--full', 'inbox--empty']);

    expect(countBundleScenes(moduleMap)).toBe(2);
    const facts = pushFactsOf({
      appBuilds: {},
      storiesInBundle: { android: countBundleStories(moduleMap) },
      scenesInBundle: { android: countBundleScenes(moduleMap) },
      env: {},
    });
    expect(facts.platforms.android).toEqual({ storiesInBundle: 0, scenesInBundle: 2 });
  });

  it('a module map of two story files and one scene file counts 2 stories, never 3', () => {
    const moduleMap = moduleMapHolding(
      ['inbox--full'],
      ['./src/Button.stories.tsx', './src/Card.stories.tsx']
    );

    expect(countBundleStories(moduleMap)).toBe(2);
    expect(countBundleScenes(moduleMap)).toBe(1);
  });

  it('a partial capture holding one changed scene file counts 0 stories and lists no story row', () => {
    const moduleMap = validateModuleManifestBuffer(
      Buffer.from(
        JSON.stringify({
          version: 1,
          header: {},
          moduleHashes: {},
          storyClosures: { './src/Home.scenes.tsx': [] },
          storyCounts: { './src/Home.scenes.tsx': 3 },
          sceneIds: ['home--a', 'home--b', 'home--c'],
        })
      )
    )!;

    expect(countStoriesIn(moduleMap, ['src/Home.scenes.tsx'])).toBe(0);
    expect(titledStoryFilesIn(moduleMap)).toEqual([]);
    expect(countBundleScenes(moduleMap)).toBe(3);
  });

  it('an app of scenes only is a valid push', async () => {
    const bundle = {
      bundlePath: '/proj/b.js',
      bundleSizeMb: 1,
      moduleManifest: moduleMapHolding(['a--b']),
    };
    mocks.buildBundles.mockResolvedValue({ results: { android: bundle }, gateMetadata: {} });

    await expect(
      uploadFreshBundles({
        projectRoot: '/proj',
        buildSettings: {},
        platforms: ['android'],
        platformsOnStoredBuild: [],
        baseFingerprints: { android: 'fp' },
        projectIndex: 1,
        teamId: 'team1234',
        effects: EFFECTS,
      } as any)
    ).resolves.toBeDefined();
  });

  it('the verdict names scenes beside stories', () => {
    const platforms = { android: { storiesInBundle: 3, scenesInBundle: 2 } };

    const holds = readBuildScreenKind({ platforms } as any);

    expect(holds).toBe('stories and scenes');
    expect(renderVerdictPassed(holds).join('\n')).toContain('All stories and scenes passed');
    expect(
      readBuildScreenKind({
        platforms: { android: { storiesInBundle: 0, scenesInBundle: 2 } },
      } as any)
    ).toBe('scenes');
  });
});

/** A module map holding these story and scene files, each with its count of stories or scenes. */
function moduleMapOfFiles(counts: Record<string, number>, sceneIds: string[]) {
  const files = Object.keys(counts);
  return validateModuleManifestBuffer(
    Buffer.from(
      JSON.stringify({
        version: 1,
        header: {},
        moduleHashes: {},
        storyClosures: Object.fromEntries(files.map((file) => [file, []])),
        storyCounts: counts,
        sceneIds,
      })
    )
  )!;
}

/** The Started row's words for the capture the server decided, over this module map. */
function startedRowFor(
  moduleMap: ReturnType<typeof moduleMapHolding>,
  captureScope: { full: boolean; storyFilePaths?: string[] }
): string {
  const capture = capturePerPlatform({
    openBuildReturn: {
      build: { index: 1 },
      buildRun: { config: { ios: { captureScope } } },
    } as any,
    moduleManifests: { ios: moduleMap },
    platformsToTest: ['ios'],
  });
  return describeWhatRuns({ capture });
}

describe('a push of an app of scenes says scenes on every capture', () => {
  it('a push that reuses the last bundle still counts its scenes and says scenes, never stories', () => {
    const moduleMap = moduleMapHolding(['a--1', 'a--2', 'a--3', 'a--4', 'a--5', 'a--6']);

    const row = startedRowFor(moduleMap, { full: false, storyFilePaths: [] });

    expect(row).toBe('0 of 6 scenes');
    expect(row).not.toContain('stories');
  });

  it('a partial capture of an app of scenes says how many of its scenes it captures', () => {
    const moduleMap = moduleMapOfFiles(
      { './src/Home.scenes.tsx': 3, './src/Inbox.scenes.tsx': 2 },
      ['home--a', 'home--b', 'home--c', 'inbox--a', 'inbox--b']
    );

    expect(startedRowFor(moduleMap, { full: false, storyFilePaths: ['src/Home.scenes.tsx'] })).toBe(
      '3 of 5 scenes'
    );
  });

  it('an app of stories and scenes says both on a partial capture', () => {
    const moduleMap = moduleMapOfFiles(
      { './src/Button.stories.tsx': 4, './src/Home.scenes.tsx': 3 },
      ['home--a', 'home--b', 'home--c']
    );

    expect(
      startedRowFor(moduleMap, {
        full: false,
        storyFilePaths: ['src/Button.stories.tsx', 'src/Home.scenes.tsx'],
      })
    ).toBe('4 of 4 stories and 3 of 3 scenes');
  });
});

describe('a sparse build of scenes words its verdict by scenes', () => {
  it('a sparse build with scenes in its bundle says scenes need review, never stories', async () => {
    const build = {
      runStatus: 'finished',
      showsOnlyBranchChanges: true,
      status: 'unreviewed',
      platforms: { ios: { storiesInBundle: 0, scenesInBundle: 8 } },
      viewStatusesCount: { approved: 0, noChanges: 6, reported: 0, unreviewed: 2 },
      diffScopeInfo: { capturedSnapshotCount: 2, inheritedSnapshotCount: 6 },
      stories: [
        { name: 'Inbox / full', status: 'review-required', baseline: null },
        { name: 'Inbox / empty', status: 'review-required', baseline: null },
        ...[3, 4, 5, 6, 7, 8].map((n) => ({
          name: `Home / ${n}`,
          status: 'unchanged',
          baseline: { buildIndex: 1 },
        })),
      ],
    };

    const { stdout } = await captureTranscript(async () => {
      await waitForBuildResult({
        token: `${'s'.repeat(32)}scenteam1`,
        buildIndex: 1,
        projectIndex: 1,
        teamId: 'scenteam',
        waitTimeoutMinutes: 45,
        pollBuildStatus: async () => build as any,
        now: () => 0,
      });
    });

    expect(stdout).toContain('2 scenes need review');
    expect(stdout).toContain('6 other scenes have no changes');
    expect(stdout).not.toContain('stories');
  });
});
