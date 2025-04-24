// Detect Storybook 7 by checking for version-specific exports
let isStorybook7 = false;

try {
  // Try to import the main Storybook package
  const storybook = require('@storybook/react-native');

  // updateView is exported in v8 but not in v7
  // If it doesn't exist, we're likely on v7
  isStorybook7 = !('updateView' in storybook);
} catch (error) {
  // Default to false if we can't detect
  isStorybook7 = false;
}

export default isStorybook7;
