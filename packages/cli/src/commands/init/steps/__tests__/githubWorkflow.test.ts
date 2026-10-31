import { describe, it } from 'vitest';

/** THE GITHUB WORKFLOW SETUP WRITES. Test outlines without bodies yet. */
describe('the GitHub workflow setup writes', () => {
  it.todo('writes the workflow when the remote is on github.com or there is none');
  it.todo('writes the workflow on GitHub even when the project runs another CI');
  it.todo('leaves an existing workflow file as it is');
  it.todo('adds no workflow when the code lives on another host');
  it.todo('a skipped workflow prints one line naming the host it found');
  it.todo(
    'until GitHub is connected, the workflow ends green with one notice saying where to connect it'
  );
});
