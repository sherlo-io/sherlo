import { describe, it } from 'vitest';

/** THE GITHUB WORKFLOW SETUP WRITES (epic init-for-agents). Shells written in plan. */
describe('the GitHub workflow setup writes', () => {
  it.todo('writes the workflow when the remote is on github.com or there is none');
  it.todo('leaves an existing workflow file as it is');
  it.todo("adds no workflow when the project keeps another CI's config file");
  it.todo('the workflow fails first, with the instruction, when SHERLO_TOKEN is missing');
});
