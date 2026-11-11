import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ logWarning: vi.fn() }));
vi.mock('../logWarning', () => ({ default: mocks.logWarning }));

import parseWaitTimeout from '../parseWaitTimeout';

describe('the --wait-timeout value', () => {
  it('an unusable wait deadline says the default is used, without naming a flat 45 minutes', () => {
    expect(parseWaitTimeout('soon')).toBeUndefined();

    const { message } = mocks.logWarning.mock.calls[0][0];
    expect(message).toContain('using the default wait');
    expect(message).not.toContain('45');
  });

  it('a usable wait deadline is returned as minutes', () => {
    expect(parseWaitTimeout('30')).toBe(30);
  });
});
