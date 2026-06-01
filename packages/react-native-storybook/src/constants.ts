export const VERIFICATION_TEST_ID = 'sherlo-getStorybook-verification';
export const DUMMY_STORY_ID = 'SherloInitialTestingDummyStory--SherloDummyStory';

// Protocol files used by the SDK runtime to talk to the runner.
// IMPORTANT: metro/polyfill.js cannot import from compiled dist/ - it duplicates
// these literals at the top of polyfill.js. Keep in sync.
export const LOG_FILE = 'log.sherlo';
export const PROTOCOL_FILE = 'protocol.sherlo';
