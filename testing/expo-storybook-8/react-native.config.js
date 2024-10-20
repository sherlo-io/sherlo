module.exports = {
  dependencies: {
    ...(process.env.EXCLUDE_SHERLO
      ? {
          '@sherlo/react-native-storybook': {
            platforms: {
              ios: null,
              android: null,
            },
          },
        }
      : {}),
  },
  project: {
    ios: {},
    android: {},
  },
};
