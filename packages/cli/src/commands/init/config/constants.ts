export const EVENT = '5_config';

/** One Android phone: the first test needs one build, and an Android build works on any machine. */
export const DEFAULT_DEVICES = [
  {
    id: 'pixel.7.pro',
    osVersion: '13',
  } as const,
];
