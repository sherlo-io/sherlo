/**
 * THE CLI'S PUBLIC COMMAND SURFACE - what `sherlo --help` lists and what an
 * unknown command is answered with.
 *
 * `test:standard` and `test:eas-update` were removed when `sherlo test` became
 * the one testing command (`sherlo test --android/--ios` is the former, and
 * every run now ships fresh JS, which was the latter's only job). These cases
 * pin that removal at the entry point: the program is built the way `start()`
 * builds it and parsed against real argv, so a command quietly re-registered
 * reds here.
 *
 * Commander answers an unknown command by printing
 * `error: unknown command '<name>'` on stderr and exiting 1; `--help` prints the
 * command list on stdout and exits 0. Both exits are intercepted, since a real
 * `process.exit` would end the test runner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../helpers/reporting', () => ({
  default: {
    init: vi.fn(),
    setContext: vi.fn(),
    setTag: vi.fn(),
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(true),
  },
}));

import start from '../start';

class ExitSignal extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

let stdout: string;
let stderr: string;
let exitCodes: (number | undefined)[];
const originalArgv = process.argv;

beforeEach(() => {
  stdout = '';
  stderr = '';
  exitCodes = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as never);
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as never);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCodes.push(code);
    throw new ExitSignal(code);
  }) as never);
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
});

/**
 * Runs the CLI over `args`. Commander ends both a help display and an unknown
 * command with `process.exit`, which the mock above turns into a thrown
 * ExitSignal; `start()` catches it and exits again, so the settled promise is
 * always a rejection carrying that signal. The FIRST recorded exit code is
 * commander's own verdict.
 */
async function runCli(...args: string[]): Promise<number | undefined> {
  process.argv = ['node', 'sherlo', ...args];
  await start().catch(() => undefined);
  return exitCodes[0];
}

describe('sherlo --help', () => {
  it('lists `test` and the EAS cloud-build commands, and neither removed command', async () => {
    const exitCode = await runCli('--help');

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^\s+test\b/m);
    expect(stdout).toMatch(/^\s+test:eas-cloud-build\b/m);
    expect(stdout).toMatch(/^\s+eas-build-on-complete\b/m);
    expect(stdout).not.toContain('test:standard');
    expect(stdout).not.toContain('test:eas-update');
  });

  it('describes both roads of `test` under the one command', async () => {
    await runCli('--help');

    expect(stdout).toContain('--android');
    expect(stdout).toContain('--ios');
  });
});

describe('a removed command', () => {
  it.each(['test:standard', 'test:eas-update'])(
    '`sherlo %s` is answered with commander`s unknown-command error and exit 1',
    async (removedCommand) => {
      const exitCode = await runCli(removedCommand, '--android', 'app.apk');

      expect(exitCode).toBe(1);
      expect(stderr).toContain(`error: unknown command '${removedCommand}'`);
    }
  );

  it.each(['local-builds', 'expo-update'])(
    'the hidden alias `%s` of a removed command is gone with it',
    async (alias) => {
      const exitCode = await runCli(alias);

      expect(exitCode).toBe(1);
      expect(stderr).toContain(`error: unknown command '${alias}'`);
    }
  );
});
