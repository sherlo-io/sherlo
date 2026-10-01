/**
 * The live workstation's `pod install`: CocoaPods stops with `Unicode Normalization not appropriate
 * for ASCII-8BIT` when the terminal names no language, as on a CI machine, so the live act hands it
 * a UTF-8 one when the environment names none.
 *
 * The shell runner is mocked at its leaf, so the environment the child process would have been
 * started with is what is read, and no `pod install` runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveWorkstation } from '../workstation';

const { shellRuns } = vi.hoisted(() => ({
  shellRuns: [] as { command: string; env?: NodeJS.ProcessEnv }[],
}));

vi.mock('../../helpers/runShellCommand/executeCommand', () => ({
  default: (run: { command: string; env?: NodeJS.ProcessEnv }) => {
    shellRuns.push(run);
    return Promise.resolve('');
  },
}));

const ambientLocale = { LANG: process.env.LANG, LC_ALL: process.env.LC_ALL };

beforeEach(() => {
  shellRuns.length = 0;
});

afterEach(() => {
  restoreVariable('LANG', ambientLocale.LANG);
  restoreVariable('LC_ALL', ambientLocale.LC_ALL);
});

describe('the live pod install', () => {
  it('the live pod install runs with a UTF-8 locale when the environment names none', async () => {
    delete process.env.LANG;
    delete process.env.LC_ALL;

    await liveWorkstation.installPods({
      command: 'cd ios && pod install',
      projectRoot: '/nowhere',
    });

    expect(shellRuns).toHaveLength(1);
    expect(shellRuns[0].env).toMatchObject({ LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' });
  });

  it('the live pod install keeps a locale the environment already names', async () => {
    process.env.LANG = 'de_DE.UTF-8';
    process.env.LC_ALL = 'pl_PL.UTF-8';

    await liveWorkstation.installPods({
      command: 'cd ios && pod install',
      projectRoot: '/nowhere',
    });

    expect(shellRuns).toHaveLength(1);
    expect(shellRuns[0].env).toMatchObject({ LANG: 'de_DE.UTF-8', LC_ALL: 'pl_PL.UTF-8' });
  });
});

/* ========================================================================== */

function restoreVariable(name: 'LANG' | 'LC_ALL', value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
