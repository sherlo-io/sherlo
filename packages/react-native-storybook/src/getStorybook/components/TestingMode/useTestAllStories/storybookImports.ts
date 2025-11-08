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

export const getAddons = (): any => addonsV8 ?? addonsV7;

// This was originally imported from:
// - @storybook/core-events in Storybook 7
// - @storybook/core/core-events in Storybook 8
// We keep it hardcoded as some users didn't have dependency in their versions of the library.
export const STORY_CHANGED = 'storyChanged';
