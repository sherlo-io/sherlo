/** A SCENE THAT SITS STILL ON A SCREEN (../stillScreen) - when the screen is found still, and the ending it gets. */
import { afterEach, describe, expect, it } from 'vitest';
import { renderCapturedScene } from '../../render/capturedScene';
import { installDeviceState, posedDeviceState } from '../deviceState';
import { sceneCauseOf } from '../sceneCause';
import { endingOfStillScreen, waitForStillScreen } from '../stillScreen';

const QUICK = { stillMs: 60, loadingMs: 300, lookEveryMs: 10 };
const ANDROID = { platform: 'android', serial: 'emulator-5554' } as const;

const dumpOf = (text: string, extra = '') =>
  `<hierarchy><node class="android.widget.TextView" package="com.example" text="${text}" />${extra}</hierarchy>`;

describe('waiting for a screen to sit still', () => {
  let uninstall = () => {};
  afterEach(() => uninstall());

  const phoneShowing = (dumps: () => string) => {
    uninstall = installDeviceState({ ...posedDeviceState(), run: async () => dumps() });
  };

  it('finds a screen that has not changed for the limit', async () => {
    phoneShowing(() => dumpOf('Login'));

    const still = await waitForStillScreen(ANDROID, QUICK, new AbortController().signal);

    expect(still?.look.words).toEqual(['Login']);
    expect(still?.afterMs).toBeGreaterThanOrEqual(QUICK.stillMs);
  });

  it('does not find a screen that keeps changing, and stops when told to', async () => {
    let looks = 0;
    phoneShowing(() => dumpOf(`Frame ${looks++}`));
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 150);

    expect(await waitForStillScreen(ANDROID, QUICK, stop.signal)).toBeUndefined();
  });

  it('gives a screen with a progress indicator the longer limit', async () => {
    phoneShowing(() => dumpOf('Loading', '<node class="android.widget.ProgressBar" />'));

    const still = await waitForStillScreen(ANDROID, QUICK, new AbortController().signal);

    expect(still?.afterMs).toBeGreaterThanOrEqual(QUICK.loadingMs);
  });

  it('tries a look that failed again at the next tick, and does not give up on it', async () => {
    let looks = 0;
    phoneShowing(() => (looks++ < 3 ? 'the phone answered nothing readable' : dumpOf('Login')));

    const still = await waitForStillScreen(ANDROID, QUICK, new AbortController().signal);

    expect(still?.look.words).toEqual(['Login']);
  });

  it('starts the wait only once the bundle has loaded, not while the bundler screen shows', async () => {
    phoneShowing(() => dumpOf('Loading from the bundler'));
    let loaded = false;
    setTimeout(() => (loaded = true), 150);

    const still = await waitForStillScreen(
      ANDROID,
      QUICK,
      new AbortController().signal,
      async () => loaded
    );

    expect(loaded).toBe(true);
    expect(still?.afterMs).toBeGreaterThanOrEqual(QUICK.stillMs);
    expect(still?.afterMs).toBeLessThan(150 + QUICK.stillMs);
  });

  it('gives an iOS simulator no still screen to find', async () => {
    expect(
      await waitForStillScreen(
        { platform: 'ios', udid: 'SIM-1' },
        QUICK,
        new AbortController().signal
      )
    ).toBeUndefined();
  });
});

describe('the ending of a screen that sat still', () => {
  const look = { words: ['Login'], views: 3, loading: false };

  it('is on another screen when it draws views, and blank when it draws none', () => {
    expect(endingOfStillScreen('chat--open', { afterMs: 10_000, look }).stop).toEqual({
      kind: 'on-another-screen',
      screen: { words: ['Login'], views: 3 },
    });
    expect(
      endingOfStillScreen('chat--open', { afterMs: 10_000, look: { ...look, words: [], views: 0 } })
        .stop?.kind
    ).toBe('blank');
  });

  it('names the place the app stopped in the ending, the cause key and the printed line', () => {
    const ending = endingOfStillScreen('chat--open', {
      afterMs: 10_000,
      look: { ...look, words: ['Login', 'Email', 'Password', 'Next'] },
    });

    expect(ending.stayedOn).toEqual(['Login', 'Email', 'Password']);
    expect(sceneCauseOf(ending)).toBe('ready view never showed on Login › Email › Password');
    expect(renderCapturedScene(ending).join('\n')).toContain(
      'the app stayed on Login › Email › Password'
    );
    expect(
      endingOfStillScreen('chat--open', { afterMs: 1, look: { ...look, words: [], views: 0 } })
        .stayedOn
    ).toEqual(['a blank screen']);
  });

  it('is covered by the permission a system dialog asks for', () => {
    const ending = endingOfStillScreen('chat--open', {
      afterMs: 10_000,
      look: { ...look, permission: 'camera' },
    });

    expect(ending.stop?.kind).toBe('covered');
    expect(ending.permission).toBe('camera');
  });
});
