import { describe, expect, it, vi } from 'vitest';
import { readStoryError, threwOf } from '../getStorybook/storyErrorRegistry';
import { watchForFatalError } from '../fatalErrorWatch';

describe('a fatal error ends the scene', () => {
  it('a fatal error during a scene answers threw with the error and is never answered ready', () => {
    let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
    const earlier = vi.fn();
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = {
      getGlobalHandler: () => earlier,
      setGlobalHandler: (next: typeof handler) => {
        handler = next;
      },
    };
    try {
      watchForFatalError('chat--conversation');
      const error = new Error('undefined is not a function');
      error.stack = 'Error: undefined is not a function\n    at Chat (chat.tsx:12:3)';

      handler?.(error, false);
      expect(readStoryError('chat--conversation')).toBeUndefined();

      handler?.(error, true);
      expect(threwOf('chat--conversation')).toEqual({
        name: 'Error',
        message: 'undefined is not a function',
        topFrames: ['at Chat (chat.tsx:12:3)'],
      });
      expect(earlier).toHaveBeenCalledTimes(2);
    } finally {
      delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
    }
  });
});
