import { afterEach, describe, expect, it, vi } from 'vitest';

const keyboard = vi.hoisted(() => ({ focused: null as unknown, up: false, locked: false }));
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  TextInput: { State: { currentlyFocusedInput: () => keyboard.focused } },
}));
vi.mock('../helpers/RunnerBridge', () => ({ default: { log: vi.fn(), send: vi.fn() } }));
vi.mock('../SherloModule', () => ({
  default: {
    holdAnimationsStill: async () => true,
    fieldsTakeFocus: () => !keyboard.locked,
    getInspectorData: async () => {
      throw new Error('no view tree');
    },
  },
}));

const field = vi.hoisted(() => ({
  fiber: {
    type: 'RCTSinglelineTextInputView',
    memoizedProps: { autoFocus: true, testID: 'message-input' },
    stateNode: { canonical: { publicInstance: { name: 'the field' } } },
  },
}));
vi.mock('../componentNames', () => ({
  currentAppFiber: () => ({ type: 'RCTView', child: field.fiber }),
}));

import { fieldsStillWaitingForFocus } from '../focusedField';
import { keepNeverSettled, neverSettledOf, waitForFocusedField } from '../neverSettled';
import { stabilizeOnceReady, storyAboutToRender } from '../storyReady';

afterEach(() => {
  keyboard.focused = null;
  keyboard.up = false;
  keyboard.locked = false;
  vi.useRealTimers();
});

describe('a scene waits for its focused field', () => {
  it('a screen with an auto-focused text field is not ready until that field holds focus', () => {
    expect(fieldsStillWaitingForFocus()).toEqual(['message-input']);
    keyboard.focused = field.fiber.stateNode.canonical.publicInstance;
    expect(fieldsStillWaitingForFocus()).toEqual([]);
  });

  it('a focused field with no keyboard on screen is ready, not never settled', async () => {
    keyboard.focused = field.fiber.stateNode.canonical.publicInstance;
    keyboard.up = false;
    expect((await waitForFocusedField(1_000)).unfocused).toEqual([]);
  });

  it('a field that takes focus late leaves the settle wait only the rest of the limit', async () => {
    vi.useFakeTimers();
    storyAboutToRender('chat--late-focus');
    const native = { stabilize: vi.fn(async (..._settings: unknown[]) => true) };
    setTimeout(() => {
      keyboard.focused = field.fiber.stateNode.canonical.publicInstance;
    }, 350);
    const settling = stabilizeOnceReady(native as never).stabilize(
      3,
      3,
      500,
      5_000,
      false,
      0,
      true
    );
    await vi.runAllTimersAsync();
    expect(await settling).toBe(true);
    // The field took focus on the poll at 400 ms: the settle has 5000 - 400 ms left.
    expect(native.stabilize.mock.calls[0][3]).toBe(4_600);
  });

  it('a field that never takes focus by the limit is named in the never settled answer', async () => {
    vi.useFakeTimers();
    const waiting = waitForFocusedField(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    const { unfocused } = await waiting;
    expect(unfocused).toEqual(['message-input']);

    const keeping = keepNeverSettled('chat--compose', unfocused);
    await vi.runAllTimersAsync();
    await keeping;
    expect(neverSettledOf('chat--compose')?.unfocused).toEqual(['message-input']);
  });

  it('a field the native side keeps from taking focus is not waited for, and the screen settles', async () => {
    keyboard.locked = true;
    expect(fieldsStillWaitingForFocus()).toEqual([]);

    storyAboutToRender('chat--focus-locked');
    const native = { stabilize: vi.fn(async (..._settings: unknown[]) => true) };
    const settled = await stabilizeOnceReady(native as never).stabilize(
      3,
      3,
      500,
      5_000,
      false,
      0,
      true
    );
    expect(settled).toBe(true);
    // No time went on a focus that cannot come: the settle has the whole limit.
    expect(native.stabilize.mock.calls[0][3]).toBe(5_000);
    expect(neverSettledOf('chat--focus-locked')).toBeUndefined();
  });
});
