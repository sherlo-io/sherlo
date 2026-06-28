import { describe, it, expect } from 'vitest';
// SHERLO-1506 gate verification (TRANSIENT - reverted next commit)
describe('SHERLO-1506 gate verification', () => {
  it('intentionally fails to prove the unit-test gate catches failures', () => {
    expect(1).toBe(2);
  });
});
