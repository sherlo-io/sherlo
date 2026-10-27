import { describe, expect, it } from 'vitest';
import gitFailureReason from '../gitFailureReason';

describe('the reason a git failure gives', () => {
  it("is the failed command's stderr, trimmed, when it has one", () => {
    expect(gitFailureReason(Object.assign(new Error('boom'), { stderr: ' fatal: no\n' }))).toBe(
      'fatal: no'
    );
  });

  it('falls back to the error message, then to the value itself', () => {
    expect(gitFailureReason(new Error('boom'))).toBe('boom');
    expect(gitFailureReason('plain')).toBe('plain');
  });
});
