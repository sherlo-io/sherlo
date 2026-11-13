import { describe, it } from 'vitest';

describe('the lines the test prints about Diff Scope', () => {
  it.todo('prints the three lines for a narrowed capture');
  it.todo('prints the three lines for a full capture with its reason');
  it.todo('prints the three lines with a warning when the quick check could not finish');
  it.todo('prints nothing when the server sent no Diff Scope numbers');
  it.todo('prints the captured and reused counts the service answered, not a sum of its own');
  it.todo('prints the three lines once when both platforms answered the same');
  it.todo(
    'prints the three lines once per platform under a line naming it when the platforms differ'
  );
  it.todo('marks the captured line with a warning when the quick check failed');
  it.todo(
    'names the changed file when one file changed and says the several-files words when more than one did'
  );
});
