/** THE DEVTOOLS COMMANDS - `pose` and `mask` exist only while `SHERLO_DEVTOOLS=1`. */
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MASK_COMMAND, POSE_COMMAND } from '../constants';
import { addDevtoolsCommands } from '../devtoolsCommands';

afterEach(() => {
  vi.unstubAllEnvs();
});

const namesAfterAdding = () => {
  const program = new Command();
  addDevtoolsCommands(program);
  return program.commands.map((command) => command.name()).sort();
};

describe('the devtools commands', () => {
  it('are registered when the gate is open', () => {
    vi.stubEnv('SHERLO_DEVTOOLS', '1');

    expect(namesAfterAdding()).toEqual([MASK_COMMAND, POSE_COMMAND].sort());
  });

  it('are not there for a person who has not opened the gate', () => {
    vi.stubEnv('SHERLO_DEVTOOLS', '');

    expect(namesAfterAdding()).toEqual([]);
  });
});
