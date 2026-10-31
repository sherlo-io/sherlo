import { describe, expect, it } from 'vitest';
import { renderStepInProgress } from '../stepInProgress';

describe('a step still running', () => {
  it('shows only its words when no time is given', () => {
    expect(renderStepInProgress({ kind: 'app-build-compiling', platform: 'android' })).toBe(
      '🤖 Android  Building the app with Gradle...'
    );
  });

  it('adds the time it has run so far, so a long build never reads as stuck', () => {
    expect(renderStepInProgress({ kind: 'app-build-compiling', platform: 'ios' }, 760)).toBe(
      '🍎 iOS      Building the app with Xcode... 12m 40s'
    );
  });
});
