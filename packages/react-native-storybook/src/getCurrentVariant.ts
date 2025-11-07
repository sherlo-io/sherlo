import { StoryId } from './types';
import SherloModule from './SherloModule';

/**
 * Current variant tracker
 * Tracks the currently selected story variant by listening to Storybook's channel events
 */
// Use global to ensure variables are shared across module instances
// IMPORTANT: Never reset existing cache, only initialize if it doesn't exist
const getGlobalCache = () => {
  const globalAny = global as any;
  if (!globalAny.__SHERLO_VARIANT_CACHE__) {
    globalAny.__SHERLO_VARIANT_CACHE__ = {
      currentStoryId: null as StoryId | null,
      cachedStoryId: null as StoryId | null,
      lastPollUpdate: 0,
    };
    // Cache created
  }
  return globalAny.__SHERLO_VARIANT_CACHE__;
};

let channelInitialized = false;

// Helper functions to get/set cache values
const getCurrentStoryIdCache = () => getGlobalCache().currentStoryId;
const setCurrentStoryIdCache = (value: StoryId | null) => { getGlobalCache().currentStoryId = value; };

/**
 * Extracts the variant name (story title) from a story ID
 * Story ID format: `${componentId}--${variantName}`
 * @param storyId - The story ID from Storybook
 * @returns The variant name (e.g., "Basic", "Polish") or null if invalid
 */
function extractVariantFromStoryId(storyId: StoryId | string | null): string | null {
  if (!storyId || typeof storyId !== 'string') {
    return null;
  }

  // Story ID format: componentId--variantName
  const parts = storyId.split('--');
  if (parts.length >= 2) {
    // Return the variant name (everything after the last '--')
    return parts.slice(1).join('--');
  }

  return null;
}


/**
 * Initializes the channel listener to track current story changes
 * This is now handled by the addon, but we keep this for backwards compatibility
 * The addon should be registered in storybook.requires.ts
 */
function initializeChannelListener(): void {
  if (channelInitialized) {
    return;
  }
  
  // The addon handles channel listening, so we just mark as initialized
  // The addon will update the global cache directly
  channelInitialized = true;
}

/**
 * Gets the currently selected variant name
 * @returns The variant name (e.g., "Basic", "Polish") or null if no story is selected or not in storybook mode
 */
function getCurrentVariant(): string | null {
  // Try to initialize if not already done
  if (!channelInitialized) {
    initializeChannelListener();
  }

  // In testing mode, check lastState for the story ID
  const mode = SherloModule.getMode();
  if (mode === 'testing') {
    const lastState = SherloModule.getLastState();
    if (lastState?.nextSnapshot?.storyId) {
      const variant = extractVariantFromStoryId(lastState.nextSnapshot.storyId);
      return variant;
    }
  }

  // Get current story ID from global cache (updated by the addon)
  const globalAny = global as any;
  const cache = getGlobalCache();
  const currentStoryId = cache.currentStoryId;
  
  if (currentStoryId) {
    const variant = extractVariantFromStoryId(currentStoryId);
    return variant;
  }

  // Fallback: Try to get from global state (Storybook might set this)
  try {
    const globalAny = global as any;
    if (globalAny.__STORYBOOK_CURRENT_STORY__) {
      const storyId = globalAny.__STORYBOOK_CURRENT_STORY__;
      const variant = extractVariantFromStoryId(storyId);
      return variant;
    }
  } catch (e) {
    // Continue
  }
  return null;
}

/**
 * Sets the current story ID (for internal use)
 * @param storyId - The story ID to set
 */
function setCurrentStoryId(storyId: StoryId | string | null): void {
  setCurrentStoryIdCache(storyId as StoryId | null);
}

export default getCurrentVariant;
export { getCurrentVariant, initializeChannelListener, setCurrentStoryId };

