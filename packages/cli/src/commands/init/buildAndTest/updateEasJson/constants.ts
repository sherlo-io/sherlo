export const EAS_JSON_FILENAME = 'eas.json';

export const BUILD_PROFILE: Record<string, any> = {
  build: {
    'simulator:preview': {
      android: { buildType: 'apk' },
      ios: { simulator: true },
    },
  },
};
