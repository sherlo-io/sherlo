import getGlobalStates from '../utils/getGlobalStates';

describe('getGlobalStates', () => {
  afterEach(() => {
    // Clean up global state
    delete (global as any).SHERLO_TEST_STORY_ID;
  });

  it('returns undefined testStoryId when global is not set', () => {
    const states = getGlobalStates();
    expect(states.testStoryId).toBeUndefined();
  });

  it('returns testStoryId when global is set', () => {
    (global as any).SHERLO_TEST_STORY_ID = 'components-button--primary';
    const states = getGlobalStates();
    expect(states.testStoryId).toBe('components-button--primary');
  });

  it('returns object with testStoryId property', () => {
    const states = getGlobalStates();
    expect(states).toHaveProperty('testStoryId');
  });
});
