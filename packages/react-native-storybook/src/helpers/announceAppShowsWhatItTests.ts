import SherloModule from '../SherloModule';

/**
 * Tells both watchdogs that the app is up and showing what it tests: the JavaScript timer of
 * metro/polyfill.js reads the flag, the native watchdogs hear the call. The Storybook road does it
 * when its wrapper renders (./getStorybook/components/TestingMode/Storybook), an app of scenes and
 * no Storybook when its test session starts (./sceneBoot). Both are idempotent.
 */
export default function announceAppShowsWhatItTests(): void {
  (global as any).__sherloStorybookRendered = true;
  SherloModule.notifyGetStorybookCalled();
}
