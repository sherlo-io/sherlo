import { PROJECT_API_TOKEN_LENGTH } from '@sherlo/shared';
import { describe, expect, it } from 'vitest';
import { BUILD_TICKET_PREFIX, GITHUB_SESSION_PREFIX } from '../../constants';
import hasNoTokenParts from '../hasNoTokenParts';

describe('which tokens have no parts to take apart', () => {
  it.each([
    ['a personal token', 'sht_personaltoken'],
    ['a build ticket', `${BUILD_TICKET_PREFIX}buildticket`],
    ['a GitHub session', `${GITHUB_SESSION_PREFIX}githubsession`],
  ])('says %s has none', (_kind, token) => {
    expect(hasNoTokenParts(token)).toBe(true);
  });

  it('says a project token has parts', () => {
    expect(hasNoTokenParts(`${'a'.repeat(PROJECT_API_TOKEN_LENGTH)}k3j9x2ab4`)).toBe(false);
  });
});
