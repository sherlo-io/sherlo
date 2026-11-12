import { describe, expect, it } from 'vitest';
import { foldAppBundleStep } from '../foldAppBundleStep';

describe('the app bundle step fold reads the push road lines', () => {
  it('folds both platforms rows of the push road to one line and keeps every other line', () => {
    const screen = [
      'Testing your app...',
      '',
      '🤖 Android  Bundling the JavaScript...',
      '🤖 Android  ✔ Reused',
      '🍎 iOS      Bundling the JavaScript...',
      '🍎 iOS      ✔ Bundled',
      '',
      'Test 1      Started',
    ].join('\n');

    expect(foldAppBundleStep(screen)).toBe(
      ['Testing your app...', '', '<APP_BUNDLE_STEP>', 'Test 1      Started'].join('\n')
    );
  });

  it('leaves a screen with no bundle step as it is', () => {
    expect(foldAppBundleStep('Test 1      Started\n')).toBe('Test 1      Started\n');
  });
});
