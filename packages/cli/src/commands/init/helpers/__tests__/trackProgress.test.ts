import { describe, expect, it, vi } from 'vitest';
import { BLANKED } from '../../../../helpers/blankSecrets';
import { serverCalls } from '../../../../seams/serverCalls';
import trackProgress from '../trackProgress';

vi.mock('../../../../seams/serverCalls', () => ({
  serverCalls: vi.fn(),
}));

const PROJECT_KEY = `${'a'.repeat(32)}k3j9x2ab4`;

describe('the progress report of setup', () => {
  it('a project key inside an error message is blanked while the step and version stay', async () => {
    const trackCliInit = vi.fn(async () => ({ sessionId: 'session-1' }));
    vi.mocked(serverCalls).mockReturnValue({ trackCliInit } as never);

    await trackProgress({
      event: 'init',
      sessionId: null,
      params: {
        step: 'requirements',
        version: '1.2.3',
        error: new Error(`Request failed for token ${PROJECT_KEY}: 401`),
      },
    });

    const { stringifiedParams } = (
      trackCliInit.mock.calls[0] as unknown as [{ stringifiedParams: string }]
    )[0];

    expect(stringifiedParams).not.toContain(PROJECT_KEY);
    expect(JSON.parse(stringifiedParams)).toEqual({
      step: 'requirements',
      version: '1.2.3',
      error: `Request failed for token ${BLANKED}: 401`,
    });
  });
});
