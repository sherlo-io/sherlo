export const modes = {
  FULL_HEIGHT_MODE: 'fullHeight',
  DEFAULT_MODE: 'deviceHeight',
} as const;

export type SnapshotMode = (typeof modes)[keyof typeof modes];
