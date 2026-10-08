/**
 * THE RECORD EVERY COMMAND KEEPS OF HOW IT ENDED, WHICH `sherlo feedback` ATTACHES (sherlo / Sending
 * feedback).
 */
import { describe, it } from 'vitest';

// Shells for epic sherlo-feedback. Each `it.todo` becomes a real `it(...)` with the exact same name.
describe('the last command record', () => {
  it.todo(
    "Every Sherlo command records its name, its flags with tokens hidden, its exit code and its error lines in the project's .sherlo folder"
  );
});
