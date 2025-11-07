let addonsV7: any, addonsV8: any;
let previewApiV7: any, previewApiV8: any;
let channelsV7: any, channelsV8: any;

// Try manager API (for web manager - won't work in React Native preview)
try {
  addonsV7 = require('@storybook/manager-api').addons;
} catch (error) {
  // Ignore if module is not found
}

try {
  addonsV8 = require('@storybook/core/manager-api').addons;
} catch (error) {
  // Ignore if module is not found
}

// Try preview API (for React Native preview - this is what we need!)
try {
  previewApiV7 = require('@storybook/preview-api');
} catch (error) {
  // Ignore if module is not found
}

try {
  previewApiV8 = require('@storybook/core/preview-api');
} catch (error) {
  // Ignore if module is not found
}

// Try channels directly
try {
  channelsV7 = require('@storybook/channels');
} catch (error) {
  // Ignore if module is not found
}

try {
  channelsV8 = require('@storybook/core/channels');
} catch (error) {
  // Ignore if module is not found
}

export const getAddons = (): any => {
  // First try preview API (for React Native)
  if (previewApiV8?.addons) return previewApiV8.addons;
  if (previewApiV7?.addons) return previewApiV7.addons;
  
  // Fallback to manager API (for web manager)
  return addonsV8 ?? addonsV7;
};

// Export loaded modules for debugging
export { previewApiV7, previewApiV8, addonsV7, addonsV8, channelsV7, channelsV8 };

export const getChannel = (): any => {
  // Try to get channel from preview API
  if (previewApiV8?.addons?.getChannel) {
    try {
      return previewApiV8.addons.getChannel();
    } catch (e) {
      // Ignore
    }
  }
  if (previewApiV7?.addons?.getChannel) {
    try {
      return previewApiV7.addons.getChannel();
    } catch (e) {
      // Ignore
    }
  }
  
  // Try to get channel from manager API
  const addons = getAddons();
  if (addons?.getChannel) {
    try {
      return addons.getChannel();
    } catch (e) {
      // Ignore
    }
  }
  
  // Try channels directly (if available)
  if (channelsV8) {
    try {
      // Channels might be exposed globally or through a singleton
      const globalAny = global as any;
      if (globalAny.__STORYBOOK_CHANNEL__) {
        return globalAny.__STORYBOOK_CHANNEL__;
      }
    } catch (e) {
      // Ignore
    }
  }
  
  return null;
};

// This was originally imported from:
// - @storybook/core-events in Storybook 7
// - @storybook/core/core-events in Storybook 8
// We keep it hardcoded as some users didn't have dependency in their versions of the library.
export const SET_CURRENT_STORY = 'setCurrentStory';
