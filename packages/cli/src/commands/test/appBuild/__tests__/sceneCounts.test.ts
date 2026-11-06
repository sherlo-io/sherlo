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
import { readBuildScreenKind } from '../../../../helpers/waitForBuildResult';
import { renderVerdictPassed } from '../../../../render/verdictCloser';
import {
  countBundleScenes,
  countBundleStories,
  countStoriesIn,
  titledStoryFilesIn,
  validateModuleManifestBuffer,
} from '../../readModuleManifest';
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
