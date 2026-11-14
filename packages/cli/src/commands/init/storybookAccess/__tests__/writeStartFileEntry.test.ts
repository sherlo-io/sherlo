/**
 * THE APP ENTRY THE STORYBOOK ENTRY REQUIRES (writeStartFile.ts): a path, never a bare name.
 * Shells; the fix makes them true.
 */
import { describe, it } from 'vitest';

describe("the Storybook entry's require of the app", () => {
  it.todo(
    "the Storybook entry requires the app's entry by a relative path when package.json names no main"
  );
  it.todo('the Storybook entry keeps requiring the entry package.json names when it names one');
});
