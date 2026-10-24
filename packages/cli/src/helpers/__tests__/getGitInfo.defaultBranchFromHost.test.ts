import { describe, it } from 'vitest';

// Shells written in plan for bwg-sherlo-asks-git-host: the builder makes each one true.
describe('the default branch asked of the git host', () => {
  it.todo('reads the default branch from the git host when the clone records no origin/HEAD');
  it.todo('asks the git host with terminal prompts off');
  it.todo('gives up on the git host after 10 seconds and sends no default branch');
  it.todo('is omitted when the git host does not answer');
});
