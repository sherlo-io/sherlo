export const modes = {
  FULL_HEIGHT_MODE: 'fullHeight',
  DEFAULT_MODE: 'deviceHeight',
} as const;

export type SnapshotMode = (typeof modes)[keyof typeof modes];

export const TOGGLE_STORYBOOK_DEV_SETTINGS_MENU_ITEM = 'Toggle Storybook';
