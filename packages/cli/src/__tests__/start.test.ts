/**
 * `start()` ends a failed command with an exit code. A Node file-system error carries a STRING
 * `code` (`'ENOENT'`), which `process.exit` refuses with a TypeError, so only a numeric code is
 * passed on and everything else exits 1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { reportingInit } = vi.hoisted(() => ({ reportingInit: vi.fn() }));

vi.mock('../helpers/reporting', () => ({
  default: {
    init: reportingInit,
    setContext: vi.fn(),
    setTag: vi.fn(),
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(true),
  },
}));

import start from '../start';

let exitCodes: unknown[];

beforeEach(() => {
  exitCodes = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: unknown) => {
    exitCodes.push(code);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Runs `start()` with the first thing it does failing with `failure`; answers the exit code. */
async function exitCodeOfFailure(failure: Error & { code?: unknown }) {
  reportingInit.mockImplementation(() => {
    throw failure;
  });
  await start();
  return exitCodes[0];
}

describe('the exit of a failed command', () => {
  it('a failure whose code is not a number exits 1', async () => {
    const fsError = Object.assign(new Error("ENOENT: no such file or directory, lstat 'x'"), {
      code: 'ENOENT',
    });
    expect(await exitCodeOfFailure(fsError)).toBe(1);
  });

  it('a failure that carries a numeric code exits with it, and one with no code exits 1', async () => {
    expect(await exitCodeOfFailure(Object.assign(new Error('timed out'), { code: 3 }))).toBe(3);
    exitCodes = [];
    expect(await exitCodeOfFailure(new Error('plain'))).toBe(1);
  });
});
