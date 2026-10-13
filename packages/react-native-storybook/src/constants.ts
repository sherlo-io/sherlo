export const VERIFICATION_TEST_ID = 'sherlo-getStorybook-verification';
export const DUMMY_STORY_ID = 'SherloInitialTestingDummyStory--SherloDummyStory';

// What is on screen in place of a story that failed to render, read off the screen rather than out of
// the story error registry (../getStorybook/storyErrorRegistry). A broken story is known by either of
// those two, and two readers have to agree on both: the test run that records a story, and the
// capture that records the same story the same way (../captureTransport).
export const STORY_ERROR_FALLBACK_TEXT = 'Something went wrong rendering your story';

/** Where a bundler mounts the app's connection, on the bundler's own port. */
export const BUNDLER_LINE_PATH = '/sherlo/line';
