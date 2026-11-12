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

  it('a sim opening followed straight by a warning folds like the bundle step before it', () => {
    const warning = "! Couldn't fetch the git history: error";
    const sim = [
      'Testing your app...',
      '',
      '\u001b[1m\u001b[22m',
      '\u001b[1m🧪 Sim mode: testing the declared world (<PROJECT_ROOT>/sim-world)...\u001b[22m',
      '\u001b[1m\u001b[22m',
      '\u001b[36m\u001b[39m',
      '\u001b[36m⬆️  Uploading android sim world + manifest...\u001b[39m',
      warning,
      '  The build goes on.',
      'Test 3      Started',
    ].join('\n');
    const posed = [
      'Testing your app...',
      '',
      '🤖 Android  Bundling the JavaScript...',
      '🤖 Android  ✔ Reused from Test 1',
      warning,
      '  The build goes on.',
      '',
      'Test 3      Started',
    ].join('\n');

    expect(foldAppBundleStep(sim)).toBe(foldAppBundleStep(posed));
  });

  it('leaves a screen with no bundle step as it is', () => {
    expect(foldAppBundleStep('Test 1      Started\n')).toBe('Test 1      Started\n');
  });
});
