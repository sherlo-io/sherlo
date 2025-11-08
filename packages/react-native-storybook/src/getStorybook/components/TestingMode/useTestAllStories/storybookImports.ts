let addonsV7: any, addonsV8: any;

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
