/**
 * A local stack is a fourth copy of the product, built for one test run and thrown away.
 * A tool built against it must not report its errors anywhere: the `dsn` table has a row
 * for the `local` stage with no DSN, and `Sentry.init` with no DSN sends nothing. This
 * suite builds the reporting helper once per stage, with `ENV` stubbed to that stage, and
 * reads the options `Sentry.init` was called with.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryInit = vi.fn();

vi.mock('@sentry/node', () => ({
  init: (options: unknown) => sentryInit(options),
  setContext: vi.fn(),
  setTag: vi.fn(),
  addBreadcrumb: vi.fn(),
  setExtra: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(),
}));

async function initReportingBuiltForStage(
  stage: string
): Promise<{ dsn?: string; environment: string }> {
  vi.resetModules();
  vi.doMock('@sherlo/sdk-client', () => ({ ENV: stage }));

  const reporting = (await import('../reporting')).default;
  reporting.init();

  return sentryInit.mock.calls[0][0];
}

describe('the tool reports errors only from a stack that outlives the run', () => {
  beforeEach(() => {
    sentryInit.mockClear();
  });

  it('a tool built against a local stack reports to no Sentry', async () => {
    const options = await initReportingBuiltForStage('local');

    expect(options.dsn).toBeUndefined();
    expect(options.environment).toBe('local');
  });

  it('a tool built against the test stack still reports to the test Sentry', async () => {
    const options = await initReportingBuiltForStage('test');

    expect(options.dsn).toBe(
      'https://72524a664c779972513d9381c8637718@o1152742.ingest.us.sentry.io/4508388094574592'
    );
    expect(options.environment).toBe('test');
  });
});
