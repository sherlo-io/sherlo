/**
 * Gets the current active story ID from Storybook at runtime.
 * This is called from generated mock files to determine which mock to serve.
 * Format: "ComponentName--StoryName" (e.g., "TestInfo--Basic")
 * 
 * The story ID is stored in a global variable by useStorybookEventListener
 * when STORY_CHANGED event fires. This allows mock files to synchronously
 * read the current story ID without needing file-based communication.
 * 
 * @returns The current story ID, or null if no story is active
 */
export function getCurrentStory(): string | null {
  // Read from global variable set by useStorybookEventListener
  const currentStoryId = (global as any).__SHERLO_CURRENT_STORY_ID__;
  return currentStoryId || null;
}

