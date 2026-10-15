/**
 * THE LOGIN'S OPEN CALLS - `startCliLogin` and `pollCliLogin` carry no credential, but the service's
 * request gate only sees a call whose Authorization is not empty.
 */
import { describe, expect, it, vi } from 'vitest';

const sdkClientMock = vi.hoisted(() =>
  vi.fn((_options: { authToken: string }, _endpointUrl: string) => ({
    startCliLogin: async () => ({
      loginId: 'login-1',
      pollSecret: 'secret-1',
      authorizeUrl: 'https://example.com/authorize',
      expiresAt: '2030-01-01T00:00:00.000Z',
    }),
    pollCliLogin: async () => ({ status: 'pending' }),
  }))
);

vi.mock('@sherlo/sdk-client', () => ({ default: sdkClientMock }));

import { liveServerCalls } from '../serverCalls';

describe('the login calls that carry no credential', () => {
  it("sends the login's open calls with a non-empty placeholder in place of a credential", async () => {
    await liveServerCalls.startCliLogin();
    await liveServerCalls.pollCliLogin({ loginId: 'login-1', pollSecret: 'secret-1' });

    expect(sdkClientMock).toHaveBeenCalledTimes(2);
    for (const [options] of sdkClientMock.mock.calls) {
      expect(options.authToken).not.toBe('');
      expect(options.authToken).not.toMatch(/^sht_/);
      expect(options.authToken.length).toBeLessThan(32);
    }
  });
});
