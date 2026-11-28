export const EVENT = '3_metro_config';

export const NEW_IMPORT_PACKAGE = '@sherlo/react-native-storybook/metro/withStorybook';
export const WITH_STORYBOOK_IMPORT_RE =
  /^.*require\(["']@storybook\/react-native\/(?:metro\/)?withStorybook["']\).*$/m;

/** Storybook's own withStorybook, loaded by require or by import. */
export const STORYBOOKS_WITH_STORYBOOK_RE =
  /["']@storybook\/react-native\/(?:metro\/)?withStorybook["']/;
