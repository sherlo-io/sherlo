import { describe, it } from 'vitest';

// Shells written in plan (epic runner-without-files); task rwf-sdk-storybook-public-reads fills them.
describe("reads of Storybook's own fields", () => {
  it.todo("outside the one guarded file no module of the SDK reads a field of Storybook's that starts with an underscore");
  it.todo('a guarded read that finds nothing names the Storybook version in its error instead of throwing');
});
