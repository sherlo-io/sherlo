export const EVENT = '3_metro_config';

export const ALREADY_WRAPPED_TOKEN = 'withSherlo(';
export const WITH_STORYBOOK_TOKEN = 'withStorybook(';

export const NEW_IMPORT_PACKAGE = '@sherlo/react-native-storybook/metro';
export const WITH_STORYBOOK_IMPORT_RE =
  /^.*require\(["']@storybook\/react-native\/metro\/withStorybook["']\).*$/m;

export const MODULE_EXPORTS_WITH_STORYBOOK_RE =
  /module\.exports\s*=\s*(withStorybook\([\s\S]*?\))\s*;/;
