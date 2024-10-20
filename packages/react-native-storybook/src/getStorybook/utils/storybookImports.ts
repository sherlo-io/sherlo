// storybookAdapter.js
let addonsV7: any, SET_CURRENT_STORY_V7: any, addonsV8: any, SET_CURRENT_STORY_V8: any;

try {
  addonsV7 = require('@storybook/manager-api').addons;
} catch (error) {
  // Ignore if module is not found
}

try {
  SET_CURRENT_STORY_V7 = require('@storybook/core-events').SET_CURRENT_STORY;
} catch (error) {
  // Ignore if module is not found
}

try {
  addonsV8 = require('@storybook/core/manager-api').addons;
} catch (error) {
  // Ignore if module is not found
}

try {
  SET_CURRENT_STORY_V8 = require('@storybook/core/core-events').SET_CURRENT_STORY;
} catch (error) {
  // Ignore if module is not found
}

export const getAddons = (): any => addonsV8 ?? addonsV7;
export const getSetCurrentStory = (): any => SET_CURRENT_STORY_V8 ?? SET_CURRENT_STORY_V7;
