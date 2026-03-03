import SherloModule from './SherloModule';

/**
 * True when the app should display Storybook instead of the normal UI.
 *
 * Use this in your app's root component to conditionally render Storybook
 * when the user opens it via Dev Menu or when Sherlo runs visual tests.
 */
const isStorybookMode = ['storybook', 'testing'].includes(SherloModule.getMode());

export default isStorybookMode;
