import { VERIFICATION_TEST_ID, DUMMY_STORY_ID } from '../constants';

describe('SDK constants', () => {
  it('VERIFICATION_TEST_ID has expected value', () => {
    expect(VERIFICATION_TEST_ID).toBe('sherlo-getStorybook-verification');
  });

  it('DUMMY_STORY_ID follows StoryId format (contains --)', () => {
    expect(DUMMY_STORY_ID).toContain('--');
    expect(DUMMY_STORY_ID).toBe('SherloInitialTestingDummyStory--SherloDummyStory');
  });

  it('DUMMY_STORY_ID is a valid StoryId pattern', () => {
    // StoryId = `${string}--${string}`
    const parts = DUMMY_STORY_ID.split('--');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });
});
