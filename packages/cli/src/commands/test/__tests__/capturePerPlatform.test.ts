import { describe, expect, it } from 'vitest';
import { capturePerPlatform } from '../capturePerPlatform';

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
});
