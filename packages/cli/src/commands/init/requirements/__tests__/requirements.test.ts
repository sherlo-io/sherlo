import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reporting } from '../../../../helpers';
import requirements from '../requirements';

vi.mock('../validateProjectContext', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../validateHasReactNative', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../validateHasStorybook', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../validateHasWithStorybookInMetroConfig', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../validateCorePackagesVersions', () => ({ default: vi.fn(() => {}) }));
vi.mock('../../helpers/trackProgress', () => ({
  default: vi.fn(async ({ sessionId }) => ({ sessionId })),
}));

const MISTYPED_TOKEN = 'not-a-real-token-abc123';

describe('the checks setup runs before it changes anything', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a mistyped token without sending the token to the crash reporter', async () => {
    const captureException = vi.spyOn(reporting, 'captureException').mockImplementation(() => {});

    const refusal = await requirements({ token: MISTYPED_TOKEN, sessionId: null }).catch(
      (error: Error) => error
    );

    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toContain('Invalid `--token` value');
    expect(JSON.stringify(captureException.mock.calls)).not.toContain(MISTYPED_TOKEN);
    expect(String((refusal as Error & { cause?: unknown }).cause ?? '')).not.toContain(
      MISTYPED_TOKEN
    );
  });
});
