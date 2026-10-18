import { PROJECT_API_TOKEN_LENGTH } from '@sherlo/shared';
import { describe, expect, it } from 'vitest';
import { BUILD_TICKET_PREFIX, GITHUB_SESSION_PREFIX } from '../../constants';
import authTokenFor from '../authTokenFor';

describe('what authTokenFor sends the service', () => {
  it('sends only the api part of a project token', () => {
    const apiPart = 'a'.repeat(PROJECT_API_TOKEN_LENGTH);

    expect(authTokenFor(`${apiPart}k3j9x2ab4`)).toBe(apiPart);
  });

  it.each([
    ['a personal token', 'sht_personaltoken'],
    ['a build ticket', `${BUILD_TICKET_PREFIX}buildticket`],
    ['a GitHub session', `${GITHUB_SESSION_PREFIX}githubsession`],
  ])('sends %s whole', (_kind, token) => {
    expect(authTokenFor(token)).toBe(token);
  });
});
