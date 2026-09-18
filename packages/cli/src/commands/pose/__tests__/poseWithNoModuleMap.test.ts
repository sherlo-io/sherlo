import { describe, it } from 'vitest';

/**
 * A POSE CAN STATE A BUNDLE THAT CAME WITH NO MODULE MAP - written as a skeleton in plan (epic
 * diff-scope-closure, task pose-states-no-module-map). The worker fills the bodies and never renames
 * a case.
 *
 * The posed bundler always made a map from `storyClosureKeys`, so a pose could not show what the
 * tool prints when Metro was configured without Sherlo's wrapper: "all stories", with no count.
 */
describe('a pose can state a bundle with no module map', () => {
  it.todo('a posed bundle whose storyClosureKeys is null comes with no module map');
  it.todo('a preview posed with no module map prints all stories, with no count');
});
