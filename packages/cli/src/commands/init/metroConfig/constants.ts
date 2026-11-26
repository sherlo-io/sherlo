export const EVENT = '3_metro_config';

export const NEW_IMPORT_PACKAGE = '@sherlo/react-native-storybook/metro/withStorybook';
export const WITH_STORYBOOK_IMPORT_RE =
  /^.*require\(["']@storybook\/react-native\/(?:metro\/)?withStorybook["']\).*$/m;
