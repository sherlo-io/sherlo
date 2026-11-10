import { afterEach, describe, expect, it } from 'vitest';
import { installWorkstation, posedWorkstation, workstation } from '../../../seams/workstation';
import { gitHistory } from '../gitHistory';

let undo: (() => void) | undefined;
afterEach(() => undo?.());

/** A workstation whose git answers each command line from `answers`, or fails when it has none. */
function installGit(answers: Record<string, string>) {
  undo = installWorkstation({
    ...workstation(),
    readGit: async ({ command }) => {
      const key = Object.keys(answers).find((start) => command.startsWith(start));
      if (key === undefined) throw new Error('fatal: not a git repository');
      return answers[key];
    },
  });
}

describe('reading the git history of a project', () => {
  it('counts changes and reverts from the log', async () => {
    installGit({
      'git rev-parse': 'false\n',
      'git log': [
        '@@2000000\tRevert "add a"',
        '1\t5\ta.ts',
        '@@1000000\tadd a',
        '10\t0\ta.ts',
        '',
      ].join('\n'),
    });

    const { history, shallow } = await gitHistory('/project');

    expect(shallow).toBe(false);
    expect(history.get('a.ts')).toEqual({ changes: 2, rework: 5, reverts: 1, fixes: 0 });
  });

  it('ranks on the code alone when git fails', async () => {
    installGit({});

    expect(await gitHistory('/project')).toEqual({ history: new Map(), shallow: false });
  });

  it('ranks on the code alone under a pose', async () => {
    undo = installWorkstation(posedWorkstation(undefined));

    expect(await gitHistory('/project')).toEqual({ history: new Map(), shallow: false });
  });
});

describe('the git history suggest reads', () => {
  it("a shallow clone's history is read as far as it goes", async () => {
    installGit({
      'git rev-parse': 'true\n',
      'git log': ['@@1000000\tadd a', '10\t0\ta.ts', ''].join('\n'),
    });

    const { history, shallow } = await gitHistory('/project');

    expect(shallow).toBe(true);
    expect(history.get('a.ts')).toEqual({ changes: 1, rework: 0, reverts: 0, fixes: 0 });
  });

  it('a clone with no history at all still says it found none', async () => {
    installGit({ 'git rev-parse': 'true\n', 'git log': '' });

    const { history, shallow } = await gitHistory('/project');

    expect(shallow).toBe(true);
    expect(history.size).toBe(0);
  });
});
