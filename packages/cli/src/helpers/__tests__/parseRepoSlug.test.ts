import { describe, expect, it } from 'vitest';
import parseRepoSlug from '../parseRepoSlug';

describe('the owner/repo slug a git remote names', () => {
  it('reads owner/repo from an https and an ssh remote', () => {
    expect(parseRepoSlug('https://github.com/acme/app.git')).toBe('acme/app');
    expect(parseRepoSlug('git@github.com:acme/app.git')).toBe('acme/app');
  });

  it('returns nothing for a remote it cannot read', () => {
    expect(parseRepoSlug('/local/path')).toBeUndefined();
  });
});
