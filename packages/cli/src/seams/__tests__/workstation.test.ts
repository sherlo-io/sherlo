/**
 * The live workstation's `pod install`: CocoaPods stops with `Unicode Normalization not appropriate
 * for ASCII-8BIT` when the terminal names no language, as on a CI machine, so the live act hands it
 * a UTF-8 one when the environment names none.
 *
 * The shell runner is mocked at its leaf, so the environment the child process would have been
 * started with is what is read, and no `pod install` runs.
 *
 * The posed workstation's refusals: a `pods` answer the run never used is refused only when the run
 * reached the dependencies step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveWorkstation, posedWorkstation } from '../workstation';

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

  it('the live pod install keeps the locale LANG names when LC_ALL is unset', async () => {
    process.env.LANG = 'pl_PL.UTF-8';
    delete process.env.LC_ALL;

    await liveWorkstation.installPods({
      command: 'cd ios && pod install',
      projectRoot: '/nowhere',
    });

    expect(shellRuns).toHaveLength(1);
    expect(shellRuns[0].env?.LANG).toBe('pl_PL.UTF-8');
    expect(shellRuns[0].env).not.toHaveProperty('LC_ALL');
  });
});

describe('the posed workstation', () => {
  it('a pose that answers pod install is not refused when the run stopped before it', () => {
    const posed = posedWorkstation({
      install: { package: '@sherlo/react-native-storybook@2.0.2' },
      pods: 'installed',
      enter: 'pressed',
    });

    // Nothing is asked: the run ended before the dependencies step, as when requirements refused.

    expect(posed.refusals()).toEqual([]);
  });

  it('a pose that answers pod install is refused when the dependencies step ran and never asked for it', async () => {
    const posed = posedWorkstation({
      install: { package: '@sherlo/react-native-storybook@2.0.2' },
      pods: 'installed',
      enter: 'pressed',
    });

    await posed.addPackage({
      packageSpec: '@sherlo/react-native-storybook',
      command: 'yarn add @sherlo/react-native-storybook',
      projectRoot: '/nowhere',
    });

    expect(posed.refusals()).toEqual([expect.objectContaining({ call: 'installPods' })]);
  });
});

/* ========================================================================== */

function restoreVariable(name: 'LANG' | 'LC_ALL', value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
