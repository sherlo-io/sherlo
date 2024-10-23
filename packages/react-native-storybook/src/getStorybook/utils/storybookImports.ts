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
