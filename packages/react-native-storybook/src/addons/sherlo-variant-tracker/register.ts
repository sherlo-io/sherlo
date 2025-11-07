/**
 * Custom Storybook addon to track current story variant
 * This addon listens to story changes and updates a global cache
 * that can be accessed synchronously via getCurrentVariant()
 */

import { StoryId } from '../../types';

// Use global to ensure variables are shared across module instances
// IMPORTANT: Must match the structure in getCurrentVariant.ts exactly
const getGlobalCache = () => {
  const globalAny = global as any;
  if (!globalAny.__SHERLO_VARIANT_CACHE__) {
    globalAny.__SHERLO_VARIANT_CACHE__ = {
      currentStoryId: null as StoryId | null,
      cachedStoryId: null as StoryId | null,
      lastPollUpdate: 0,
    };
  }
  // Ensure the cache has all required properties (in case it was created elsewhere)
  const cache = globalAny.__SHERLO_VARIANT_CACHE__;
  if (cache.currentStoryId === undefined) cache.currentStoryId = null;
  if (cache.cachedStoryId === undefined) cache.cachedStoryId = null;
  if (cache.lastPollUpdate === undefined) cache.lastPollUpdate = 0;
  return cache;
};

/**
 * Extracts the variant name (story title) from a story ID
 * Story ID format: `${componentId}--${variantName}`
 */
function extractVariantFromStoryId(storyId: StoryId | string | null): string | null {
  if (!storyId || typeof storyId !== 'string') {
    return null;
  }
  const parts = storyId.split('--');
  if (parts.length >= 2) {
    return parts.slice(1).join('--');
  }
  return null;
}

/**
 * Attempts to get the Storybook channel using various methods
 */
function tryGetChannel(): any {
  let channel: any = null;

  // Method 1: Try global addons preview API
  try {
    const globalAny = global as any;
    if (globalAny.__STORYBOOK_ADDONS_PREVIEW) {
      const addons = globalAny.__STORYBOOK_ADDONS_PREVIEW;
      if (addons.getChannel && typeof addons.getChannel === 'function') {
        channel = addons.getChannel();
        console.log('[SHERLO:addon] Got channel via __STORYBOOK_ADDONS_PREVIEW.getChannel()');
        return channel;
      }
    }
  } catch (e) {
    // Ignore
  }

  // Method 2: Try preview API (for React Native)
  try {
    const previewApiV8 = require('@storybook/core/preview-api');
    if (previewApiV8?.addons?.getChannel) {
      channel = previewApiV8.addons.getChannel();
      console.log('[SHERLO:addon] Got channel via @storybook/core/preview-api');
      return channel;
    }
  } catch (e) {
    // Ignore
  }

  if (!channel) {
    try {
      const previewApiV7 = require('@storybook/preview-api');
      if (previewApiV7?.addons?.getChannel) {
        channel = previewApiV7.addons.getChannel();
        console.log('[SHERLO:addon] Got channel via @storybook/preview-api');
        return channel;
      }
    } catch (e) {
      // Ignore
    }
  }

  // Method 3: Try manager API (for web manager)
  if (!channel) {
    try {
      const managerApiV8 = require('@storybook/core/manager-api');
      if (managerApiV8?.addons?.getChannel) {
        channel = managerApiV8.addons.getChannel();
        console.log('[SHERLO:addon] Got channel via @storybook/core/manager-api');
        return channel;
      }
    } catch (e) {
      // Ignore
    }
  }

  if (!channel) {
    try {
      const managerApiV7 = require('@storybook/manager-api');
      if (managerApiV7?.addons?.getChannel) {
        channel = managerApiV7.addons.getChannel();
        console.log('[SHERLO:addon] Got channel via @storybook/manager-api');
        return channel;
      }
    } catch (e) {
      // Ignore
    }
  }

  // Method 4: Try channels directly
  if (!channel) {
    try {
      const channelsV8 = require('@storybook/core/channels');
      const globalAny = global as any;
      if (globalAny.__STORYBOOK_CHANNEL__) {
        channel = globalAny.__STORYBOOK_CHANNEL__;
        console.log('[SHERLO:addon] Got channel via global __STORYBOOK_CHANNEL__');
        return channel;
      }
    } catch (e) {
      // Ignore
    }
  }

  // Method 5: Try to access channel through global view object (React Native Storybook)
  if (!channel) {
    try {
      const globalAny = global as any;
      if (globalAny.view) {
        const view = globalAny.view;
        // Check various possible properties
        if (view._channel) {
          channel = view._channel;
          console.log('[SHERLO:addon] Got channel via global.view._channel');
          return channel;
        } else if (view.channel) {
          channel = view.channel;
          console.log('[SHERLO:addon] Got channel via global.view.channel');
          return channel;
        } else if (view.getChannel && typeof view.getChannel === 'function') {
          channel = view.getChannel();
          console.log('[SHERLO:addon] Got channel via global.view.getChannel()');
          return channel;
        }
      }
    } catch (e: any) {
      // Ignore
    }
  }

  return null;
}

/**
 * Updates the cache with a story ID
 */
function updateStoryId(storyId: string | null): void {
  if (!storyId) return;

  const globalAny = global as any;

  // Ensure cache exists and update it directly on global
  if (!globalAny.__SHERLO_VARIANT_CACHE__) {
    globalAny.__SHERLO_VARIANT_CACHE__ = {
      currentStoryId: null,
      cachedStoryId: null,
      lastPollUpdate: 0,
    };
  }

  // Only update if story actually changed
  if (globalAny.__SHERLO_VARIANT_CACHE__.currentStoryId === storyId) {
    return; // No change, skip
  }

  // Update directly on global object
  globalAny.__SHERLO_VARIANT_CACHE__.currentStoryId = storyId as StoryId;

  // Set timestamp for decorator polling
  globalAny.__SHERLO_VARIANT_CACHE__.lastUpdate = Date.now();

  // Log minimal info for debugging
  const variant = extractVariantFromStoryId(storyId);
  console.log('[SHERLO] Variant changed:', variant);

  // Try to emit a channel event that might trigger re-render (silently)
  try {
    const channel = tryGetChannel();
    if (channel && typeof channel.emit === 'function') {
      channel.emit('storyChanged', { storyId });
      channel.emit('updateStoryArgs', { storyId });
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Sets up the channel listener once a channel is available
 */
function setupChannelListener(channel: any): void {
  // Try to access Storybook state through preview API
  try {
    const globalAny = global as any;
    if (globalAny.__STORYBOOK_ADDONS_PREVIEW) {
      const preview = globalAny.__STORYBOOK_ADDONS_PREVIEW;

      // Try to get current story from preview API
      if (preview.getCurrentStory && typeof preview.getCurrentStory === 'function') {
        try {
          const currentStory = preview.getCurrentStory();
          if (currentStory?.id) {
            updateStoryId(currentStory.id);
          }
        } catch (e: any) {
          // Silently ignore errors
        }
      }
    }
  } catch (e: any) {
    console.warn('[SHERLO:addon] Error accessing preview API:', e?.message || e);
  }

  // Try to access current story through global.view object
  // Note: global.view might not exist immediately - it's created when Storybook initializes
  const setupViewPolling = () => {
    try {
      const globalAny = global as any;
      if (!globalAny.view) {
        return false;
      }

      const view = globalAny.view;
      const allKeys = Object.keys(view);

      // Find properties that might contain current story
      const relevantKeys = allKeys.filter(
        (k) =>
          k.toLowerCase().includes('story') ||
          k.toLowerCase().includes('selected') ||
          k.toLowerCase().includes('current') ||
          k.toLowerCase().includes('id') ||
          k.toLowerCase().includes('active') ||
          k.toLowerCase().includes('async') ||
          k.toLowerCase().includes('index')
      );

      // Try to hook into _setStory if it's a function - this is likely called when stories change
      if (typeof view._setStory === 'function') {
        const originalSetStory = view._setStory.bind(view);
        view._setStory = function (...args: any[]) {
          const result = originalSetStory(...args);
          // Check if args contain story ID
          const storyId =
            args[0]?.id || args[0]?.storyId || (typeof args[0] === 'string' ? args[0] : null);
          if (storyId && typeof storyId === 'string' && storyId.includes('--')) {
            updateStoryId(storyId);
          }
          return result;
        };
      }

      // Check various properties that might contain current story
      const possibleStoryIdProperties = [
        '_selectedStoryId',
        'selectedStoryId',
        '_currentStoryId',
        'currentStoryId',
        '_activeStoryId',
        'activeStoryId',
        '_storyId',
        'storyId',
        '_asyncStorageStoryId', // This was detected in logs
      ];

      // Check immediate properties
      for (const prop of possibleStoryIdProperties) {
        if (view[prop]) {
          const value = view[prop];
          // Handle both string and object values
          const storyId = typeof value === 'string' ? value : value?.id || value?.storyId || null;
          if (storyId) {
            updateStoryId(storyId);
            break;
          }
        }
      }

      // Check object properties
      if (view._currentStory) {
        const storyId = view._currentStory?.id || view._currentStory?.storyId;
        if (storyId) {
          updateStoryId(storyId);
        }
      }
      if (view.currentStory) {
        const storyId = view.currentStory?.id || view.currentStory?.storyId;
        if (storyId) {
          updateStoryId(storyId);
        }
      }

      // Check _storyIndex - it might contain the current story
      if (view._storyIndex !== undefined) {
        try {
          // _storyIndex might be a Map or object mapping story IDs
          if (view._storyIndex instanceof Map) {
            // If it's a Map, check if we can get current story from it
            // This is a guess - we'll monitor it for changes
          } else if (typeof view._storyIndex === 'object' && view._storyIndex !== null) {
            // Check if it has a current property
            const current = (view._storyIndex as any).current;
            if (current) {
              const storyId =
                typeof current === 'string' ? current : current?.id || current?.storyId;
              if (storyId) {
                updateStoryId(storyId);
              }
            }
          }
        } catch (e) {
          // Ignore
        }
      }

      // Set up polling to check view object periodically for changes
      // Only log when something actually changes
      let lastSnapshot: Record<string, any> = {};
      let hasLoggedInitialKeys = false;

      setInterval(() => {
        const currentSnapshot: Record<string, any> = {};

        // Check all relevant keys
        relevantKeys.forEach((key) => {
          try {
            currentSnapshot[key] = view[key];
          } catch (e) {
            // Ignore errors accessing properties
          }
        });

        // Track if we've logged initial keys (but don't log anymore)
        if (!hasLoggedInitialKeys && relevantKeys.length > 0) {
          hasLoggedInitialKeys = true;
        }

        // Check for changes - only log when something actually changes
        for (const key of Object.keys(currentSnapshot)) {
          const oldValue = lastSnapshot[key];
          const newValue = currentSnapshot[key];

          if (oldValue !== newValue) {
            // Extract story ID from various formats
            let storyId: string | null = null;

            if (typeof newValue === 'string' && newValue.includes('--')) {
              storyId = newValue;
            } else if (newValue && typeof newValue === 'object') {
              storyId =
                newValue.id ||
                newValue.storyId ||
                newValue.current?.id ||
                newValue.current?.storyId ||
                null;
            } else if (typeof newValue === 'number' && key.includes('Index')) {
              // If it's an index, try to get story from _idToPrepared if available
              try {
                if (view._idToPrepared && typeof view._idToPrepared.get === 'function') {
                  // _idToPrepared might be a Map - try to find story by index
                  // This is experimental
                }
              } catch (e) {
                // Ignore
              }
            }

            if (storyId) {
              updateStoryId(storyId);
            } else if (key === '_storyIndex' && newValue !== null && typeof newValue === 'object') {
              // Special handling for _storyIndex - check if it has a current property
              try {
                const current = (newValue as any).current;
                if (current && typeof current === 'string' && current.includes('--')) {
                  updateStoryId(current);
                }
              } catch (e) {
                // Ignore
              }
            }
          }
        }

        lastSnapshot = currentSnapshot;
      }, 500); // Poll every 500ms (reduced frequency)

      return true;
    } catch (e: any) {
      console.warn('[SHERLO:addon] Error accessing global.view:', e?.message || e);
      return false;
    }
  };

  // Try immediately
  if (!setupViewPolling()) {
    // Retry periodically until view is available (silently)
    let retryCount = 0;
    const maxRetries = 50; // Retry for 10 seconds
    const viewRetryInterval = setInterval(() => {
      retryCount++;
      const result = setupViewPolling();
      if (result || retryCount >= maxRetries) {
        clearInterval(viewRetryInterval);
        if (retryCount >= maxRetries) {
          console.warn('[SHERLO:addon] ⚠️ global.view never became available');
        }
      }
    }, 200);
  }

  // Wrap channel.on (but don't log events to reduce verbosity)
  const originalOn = channel.on.bind(channel);
  channel.on = function (eventName: string, handler: Function) {
    return originalOn(eventName, handler);
  };

  // Listen to story change events - try multiple event names
  const eventNames = [
    'setCurrentStory',
    'CURRENT_STORY_WAS_SET',
    'storyChanged',
    'selectStory',
    'storySelected',
    'storyRendered',
    'updateStoryArgs',
  ];

  eventNames.forEach((eventName) => {
    try {
      channel.on(eventName, (event: any) => {
        console.log('[SHERLO:addon] Event:', eventName, event);
        const storyId = event?.storyId || event?.story?.id || event?.id || event?.storyId || null;
        if (storyId) {
          updateStoryId(storyId);
        }
      });
    } catch (e: any) {
      // Silently ignore errors
    }
  });

  // Try to get initial story immediately
  const tryGetCurrentStory = () => {
    try {
      // Method 1: getCurrentStory method
      if (typeof (channel as any).getCurrentStory === 'function') {
        const currentStory = (channel as any).getCurrentStory();
        if (currentStory?.id) {
          updateStoryId(currentStory.id);
          return;
        }
      }

      // Method 2: lastEvent property
      if ((channel as any).lastEvent) {
        const lastEvent = (channel as any).lastEvent;
        const storyId = lastEvent?.storyId || lastEvent?.story?.id || lastEvent?.id || null;
        if (storyId) {
          updateStoryId(storyId);
          return;
        }
      }

      // Method 3: Check if channel has a data property (but it seems to be listeners, not state)
      // Skip this for now as it's just listener arrays

      // Method 4: Try to get from channel.events if it stores state
      if ((channel as any).events) {
        const events = (channel as any).events;
        // Check if any event has story data
        Object.keys(events).forEach((eventName: string) => {
          const eventData = events[eventName];
          if (eventData && typeof eventData === 'object' && !Array.isArray(eventData)) {
            const storyId = eventData?.storyId || eventData?.story?.id || eventData?.id || null;
            if (storyId) {
              updateStoryId(storyId);
              return;
            }
          }
        });
      }

      // Method 4: Try to emit a request for current story
      if (typeof channel.emit === 'function') {
        try {
          channel.emit('getCurrentStory');
        } catch (e) {
          // Ignore
        }
      }
    } catch (e: any) {
      console.warn('[SHERLO:addon] Error getting current story:', e?.message || e);
    }
  };

  // Try immediately
  tryGetCurrentStory();

  // Also try after delays (in case Storybook hasn't initialized yet)
  setTimeout(() => tryGetCurrentStory(), 500);
  setTimeout(() => tryGetCurrentStory(), 2000);
}

/**
 * Registers the addon with Storybook
 * This function is called when the addon is imported
 * Since Storybook might not be initialized yet, we retry periodically
 */
function register(): void {
  // Try to get channel immediately
  let channel = tryGetChannel();

  if (channel) {
    setupChannelListener(channel);
    return;
  }

  // Channel not available yet - retry periodically
  // Storybook might initialize after this module loads
  let retryCount = 0;
  const maxRetries = 50; // Retry for 5 seconds (50 * 100ms)
  const retryInterval = setInterval(() => {
    retryCount++;
    channel = tryGetChannel();

    if (channel) {
      clearInterval(retryInterval);
      setupChannelListener(channel);
      return;
    }

    if (retryCount >= maxRetries) {
      clearInterval(retryInterval);
      console.warn(
        '[SHERLO:addon] Could not access Storybook channel after retries. Variant tracking may not work.'
      );
      const globalAny = global as any;
      console.warn(
        '[SHERLO:addon] Available globals:',
        Object.keys(globalAny)
          .filter(
            (k: string) => k.toLowerCase().includes('story') || k.toLowerCase().includes('view')
          )
          .slice(0, 10)
      );
    }
  }, 100); // Retry every 100ms
}

// Auto-register when this module is imported
register();

export default register;
