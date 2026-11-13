import { describe, expect, it } from 'vitest';
import { describeWhatRuns } from '../../../render/testSteps';
import { capturePerPlatform, picturesInPlan } from '../capturePerPlatform';

function openBuildWith(config: Record<string, unknown>, reason?: string): any {
  return {
    build: { index: 1, diffScopeInfo: { platforms: { ios: { reason } } } },
    buildRun: { config },
  };
}

describe('the capture each platform reports for the Started row', () => {
  it('leaves out a platform the server made no capture decision for', () => {
    const capture = capturePerPlatform({
      openBuildReturn: openBuildWith({ ios: { devices: [], captureScope: { full: true } } }),
      moduleManifests: {},
      platformsToTest: ['ios', 'android'],
    });

    expect(capture.map((c) => c.platform)).toEqual(['ios']);
  });

  it('takes the server reason verbatim and counts a partial capture by its story files', () => {
    const capture = capturePerPlatform({
      openBuildReturn: openBuildWith(
        { ios: { devices: [], captureScope: { full: false, storyFilePaths: ['a.stories.tsx'] } } },
        'a.stories.tsx changed'
      ),
      moduleManifests: {},
      platformsToTest: ['ios'],
    });

    expect(capture[0]).toMatchObject({
      full: false,
      capturedStories: 1,
      reason: 'a.stories.tsx changed',
      changedStoryFiles: ['a.stories.tsx'],
    });
  });

  it('reads the Diff Scope numbers of each platform without a cast', () => {
    const diffScope = { storiesChecked: 384, storiesLookDifferent: 26, quickCheck: 'FINISHED' };
    const capture = capturePerPlatform({
      openBuildReturn: {
        build: {
          index: 1,
          diffScopeInfo: { platforms: { ios: diffScope, android: { reason: 'x' } } },
        },
        buildRun: {
          config: {
            ios: { devices: [], captureScope: { full: false, storyFilePaths: ['a.stories.tsx'] } },
            android: { devices: [], captureScope: { full: true } },
          },
        },
      } as any,
      moduleManifests: {},
      platformsToTest: ['ios', 'android'],
    });

    expect(capture[0].diffScope).toEqual(diffScope);
    expect(capture[1].diffScope).toEqual({ reason: 'x' });
  });

  it('the capture plan of a first look says how many stories it takes and how to ask for all', () => {
    const openBuildReturn = openBuildWith({
      ios: { devices: [], captureScope: { full: false, storyFilePaths: ['src/A.stories.tsx'] } },
    });
    openBuildReturn.build.diffScopeInfo.isFirstLook = true;

    const capture = capturePerPlatform({
      openBuildReturn,
      moduleManifests: {
        ios: {
          raw: Buffer.from('{}'),
          parsed: {
            version: 1,
            header: {},
            moduleHashes: {},
            storyClosures: { 'src/A.stories.tsx': [], 'src/B.stories.tsx': [] },
            storyCounts: { 'src/A.stories.tsx': 3, 'src/B.stories.tsx': 20 },
          },
        } as any,
      },
      platformsToTest: ['ios'],
    });

    expect(describeWhatRuns({ capture })).toBe(
      '3 of 23 stories, a first look: --all-stories tests all 23 stories'
    );
  });

  it("a stories glob widened to a new screen counts that screen's stories as changed", () => {
    const typography = 'src/Typography.stories.tsx';
    const capture = capturePerPlatform({
      openBuildReturn: openBuildWith({
        ios: {
          devices: [],
          captureScope: {
            full: false,
            storyFilePaths: [typography],
            newStoryFilePaths: [typography],
          },
        },
      }),
      moduleManifests: {
        ios: {
          raw: Buffer.from('{}'),
          parsed: {
            version: 1,
            header: {},
            moduleHashes: {},
            storyClosures: { [typography]: [], 'src/Other.stories.tsx': [] },
            storyCounts: { [typography]: 3, 'src/Other.stories.tsx': 7 },
          },
        } as any,
      },
      platformsToTest: ['ios'],
    });

    expect(capture[0]).toMatchObject({
      capturedStories: 3,
      storiesInBundle: 10,
      newStoryFiles: [typography],
    });
    expect(describeWhatRuns({ capture })).toBe('3 of 10 stories');
  });

  it('counts the pictures of the plan as its screens on every device of each platform', () => {
    const device = (id: string) => ({
      id,
      osVersion: '1',
      theme: 'light',
      locale: 'en',
      fontScale: '1',
    });

    expect(
      picturesInPlan(
        [
          { platform: 'ios', full: false, capturedStories: 3, capturedScenes: 2 },
          {
            platform: 'android',
            full: true,
            capturedStories: 0,
            storiesInBundle: 20,
            scenesInBundle: 2,
          },
        ],
        [device('iphone.15'), device('iphone.15.pro'), device('pixel.7')] as any
      )
    ).toBe((3 + 2) * 2 + (20 + 2) * 1);
  });
});
