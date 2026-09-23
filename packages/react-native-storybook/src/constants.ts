export const VERIFICATION_TEST_ID = 'sherlo-getStorybook-verification';
export const DUMMY_STORY_ID = 'SherloInitialTestingDummyStory--SherloDummyStory';

// What is on screen in place of a story that failed to render, read off the screen rather than out of
// the story error registry (../getStorybook/storyErrorRegistry). A broken story is known by either of
// those two, and two readers have to agree on both: the test run that records a story, and the
// capture that records the same story the same way (../captureTransport).
export const STORY_ERROR_FALLBACK_TEXT = 'Something went wrong rendering your story';

// Protocol files used by the SDK runtime to talk to the runner.
// IMPORTANT: metro/polyfill.js cannot import from compiled dist/ - it duplicates
// these literals at the top of polyfill.js. Keep in sync.
export const LOG_FILE = 'log.sherlo';
export const PROTOCOL_FILE = 'protocol.sherlo';
