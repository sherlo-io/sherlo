import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import { reporting } from '../../../../helpers';
import { BLANKED } from '../../../../helpers/blankSecrets';
import throwError from '../../../../helpers/throwError';
import getPackageVersion from '../getPackageVersion';
import trackProgress from '../../helpers/trackProgress';
import hasStorybook from '../hasStorybook';
import requirements, { settleNoStorybook } from '../requirements';

let scenesFlag: 'on' | 'off' | undefined;

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  setContext: vi.fn(),
  setTag: vi.fn(),
  addBreadcrumb: vi.fn(),
  setExtra: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(),
}));
vi.mock('../validateProjectContext', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../validateHasReactNative', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../hasStorybook', async (importActual) => ({
  ...(await importActual<typeof import('../hasStorybook')>()),
  default: vi.fn(async () => true),
}));
vi.mock('../../../../seams/workstation', () => ({
  workstation: () => ({ scenesFlag: () => scenesFlag, askScenesFlag: async () => {} }),
}));
vi.mock('../refuseUnreadableMetroConfig', () => ({ default: vi.fn(async () => {}) }));
vi.mock('../validateCorePackagesVersions', () => ({ default: vi.fn(() => {}) }));
vi.mock('../getPackageVersion', () => ({ default: vi.fn() }));
vi.mock('../../helpers/trackProgress', () => ({
  default: vi.fn(async ({ sessionId }) => ({ sessionId })),
}));

const MISTYPED_TOKEN = 'not-a-real-token-abc123';
const PROJECT_KEY = `${'b'.repeat(32)}q7w5z1cd8`;

describe('the checks setup runs before it changes anything', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(trackProgress).mockClear();
  });

  it('a rejected project key is reported without the key', () => {
    const cause = new Error(`Upstream said no to ${PROJECT_KEY}`);
    const rejected: Error & { cause?: Error } = Object.assign(
      new Error(`Project key ${PROJECT_KEY} was rejected`),
      { cause }
    );

    expect(() => throwError({ message: 'Setup stopped', errorToReport: rejected })).toThrow();

    const sent = vi.mocked(Sentry.captureException).mock.calls.at(-1)?.[0] as Error & {
      cause: Error;
    };
    expect(sent.message).toBe(`Project key ${BLANKED} was rejected`);
    expect(sent.stack).not.toContain(PROJECT_KEY);
    expect(sent.stack).toContain(BLANKED);
    expect(sent.cause.message).toBe(`Upstream said no to ${BLANKED}`);
    expect(sent.cause.stack).not.toContain(PROJECT_KEY);
  });

  it('with scenes on, an app with no Storybook passes requirements and is told scenes need no Storybook', async () => {
    scenesFlag = 'on';
    vi.mocked(hasStorybook).mockResolvedValueOnce(false);
    const printed = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(requirements({ sessionId: null })).resolves.toEqual({ appHasStorybook: false });
    await settleNoStorybook({ teamId: 'k3j9x2ab', sessionId: null });

    expect(printed.mock.calls.flat().join('\n')).toContain('scenes need none');
    expect(vi.mocked(trackProgress).mock.calls.map(([call]) => call.params)).toEqual([
      expect.not.objectContaining({ status: 'failed' }),
    ]);
  });

  it('with scenes off, an app with no Storybook is refused as today', async () => {
    scenesFlag = 'off';
    vi.mocked(hasStorybook).mockResolvedValueOnce(false);
    vi.spyOn(reporting, 'captureException').mockImplementation(() => {});

    await expect(requirements({ sessionId: null })).resolves.toEqual({ appHasStorybook: false });
    await expect(settleNoStorybook({ teamId: 'k3j9x2ab', sessionId: null })).rejects.toThrow(
      'Set up Storybook before initializing Sherlo'
    );

    expect(vi.mocked(trackProgress).mock.calls.map(([call]) => call.params)).toEqual([
      expect.objectContaining({ status: 'failed' }),
    ]);
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

  it('refuses React Native older than 0.81.0, naming the installed version and the 0.81.0 it needs', async () => {
    vi.mocked(getPackageVersion).mockReturnValue('0.80.2');
    const { default: validateCorePackagesVersions } = await vi.importActual<
      typeof import('../validateCorePackagesVersions')
    >('../validateCorePackagesVersions');

    expect(() => validateCorePackagesVersions()).toThrow(
      /`react-native` version 0\.80\.2 is not supported \(requires ≥0\.81\.0\)/
    );
  });
});
