import { describe, expect, it } from 'vitest';
import isSavedLoginCredential from '../isSavedLoginCredential';

describe('which credentials come from a saved login', () => {
  it('says a person credential does', () => {
    expect(isSavedLoginCredential({ kind: 'person' })).toBe(true);
  });

  it.each([['projectToken'], ['github-session']] as const)(
    'says a %s credential does not',
    (kind) => {
      expect(isSavedLoginCredential({ kind })).toBe(false);
    }
  );
});
