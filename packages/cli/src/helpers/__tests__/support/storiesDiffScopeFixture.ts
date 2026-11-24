import type { BuildStatus } from '../../buildStatusRequest';
import type { StoriesDiffScopePage, StoryOfDiffScope } from '../../storiesDiffScopeRequest';

/** A story that was captured: a changed file reaches it through a chain of files. */
export const CAPTURED_STORY: StoryOfDiffScope = {
  storyId: 'Button/Primary',
  deviceId: 'iphone.15',
  hasDiffScopeData: true,
  state: 'final',
  record: {
    reason: 'looksDifferent',
    test: 7,
    comparedWithTest: 6,
    changedFiles: ['src/Button.tsx'],
    reachedThrough: ['src/Button.stories.tsx', 'src/Button.tsx'],
    checks: [
      { name: 'wholeTest', answer: 'eachStoryOnItsOwn', tone: 'ok', isDeciding: false },
      { name: 'changedFiles', answer: 'changedFilesReach', tone: 'warning', count: 1 },
      { name: 'quickCheck', answer: 'linesDiffer', tone: 'warning', isDeciding: true },
    ],
    drawnLines: [
      { kind: 'same', number: 1, text: '<View>' },
      { kind: 'after', number: 2, text: '<Text>Save</Text>' },
    ],
    obstacles: [],
  },
};

/** A story that reused its last picture: no changed file reaches it. */
export const REUSED_STORY: StoryOfDiffScope = {
  storyId: 'Card/Default',
  deviceId: 'iphone.15',
  hasDiffScopeData: true,
  state: 'final',
  record: {
    reason: 'looksSame',
    test: 7,
    comparedWithTest: 6,
    changedFiles: [],
    checks: [
      { name: 'wholeTest', answer: 'eachStoryOnItsOwn', tone: 'ok', isDeciding: false },
      { name: 'changedFiles', answer: 'changedFilesDoNotReach', tone: 'ok', count: 0 },
      { name: 'quickCheck', answer: 'drawnTheSame', tone: 'ok', isDeciding: true },
    ],
  },
};

/** The page of the service that holds both stories and is not cut. */
export const WHOLE_PAGE: StoriesDiffScopePage = {
  isCut: false,
  quickCheck: 'FINISHED',
  stories: [CAPTURED_STORY, REUSED_STORY],
};

/** A finished test that ran on one platform. */
export const FINISHED_TEST_ON_IOS: BuildStatus = {
  runStatus: 'finished',
  platforms: { ios: { arrived: true } },
};

/** What the CLI is asked to read. */
export const TEST_UNDER_READ = { token: 't', buildIndex: 7, projectIndex: 1, teamId: 'tm000001' };
