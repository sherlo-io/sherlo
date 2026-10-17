import { describe, expect, it } from 'vitest';
import { COLOR_ESCAPE, ESCAPE_AWARE_BOUNDARY } from '../maskPatterns';

describe('the escape-aware boundary reads a painted value', () => {
  it('lets the boundary before a value see past the colour escape painted on it', () => {
    const painted = String.fromCharCode(27) + '[34m42';
    const found = new RegExp(`${COLOR_ESCAPE}${ESCAPE_AWARE_BOUNDARY.before}42`).test(painted);

    expect(found).toBe(true);
  });
});
