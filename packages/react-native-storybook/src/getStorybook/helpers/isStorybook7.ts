let isStorybook7 = true;
try {
  // This file is present only in Storybook 7
  require('@storybook/react-native/V6');
} catch (error) {
  isStorybook7 = false;
}

export default isStorybook7;
