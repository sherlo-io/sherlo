import SherloModule from './SherloModule';

/**
 * `true` when the app should render Storybook instead of normal UI (either the user
 * opened Storybook via dev menu, or Sherlo is running visual tests).
 *
 * Captured ONCE at module-import time from the native Sherlo module. Does NOT
 * react to runtime mode changes during the same session - reload the bundle
 * to refresh.
 */
const isStorybookMode = ['storybook', 'testing'].includes(SherloModule.getMode());

export default isStorybookMode;
