import { describe, it } from 'vitest';

/**
 * THE PREVIEW SENDS THE CONFIG'S SCOPE - written as a skeleton in plan (epic diff-scope-closure, task
 * preview-answers-inside-the-scope). The worker fills the bodies and never renames a case.
 *
 * A real build's decision is narrowed to the config's include and exclude lists; the preview's
 * request carried neither, so a preview could name a story the real build would skip.
 */
describe('the preview sends the config scope', () => {
  it.todo('the preview request carries the include and exclude lists the config names');
  it.todo('a config with neither list sends neither, and the request is what it was before');
});
