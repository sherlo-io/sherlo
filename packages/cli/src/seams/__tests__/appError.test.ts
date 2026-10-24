/** appError.ts reads an error off the capture socket: name and message, and where it came from. */
import { describe, expect, it } from 'vitest';
import { readAppError } from '../appError';

describe('reading an error the app sent', () => {
  it('an error with no name or message is nothing', () => {
    expect(readAppError({ name: 'E' })).toBeUndefined();
    expect(readAppError(null)).toBeUndefined();
  });

  it('a blank component stack and a stack with no frames are left out', () => {
    expect(readAppError({ name: 'E', message: 'm', componentStack: '  ', stack: 'E: m' })).toEqual({
      name: 'E',
      message: 'm',
    });
  });
});
