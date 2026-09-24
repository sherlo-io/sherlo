/**
 * EVERY DOOR IS A SEAM (sherlo / The seams, "Every door is a seam").
 *
 * A command reaches the world only through `src/seams/`. A read written straight into a command
 * answers from the machine a pose ran on, and the screen looks right - which is why this is a lint
 * and a census rather than a review note. A module that must break the rule is named here with
 * its reason, so the exceptions stay countable and may only shrink. Written as a skeleton in plan
 * (epic pose-road-hardening, task pose-road-doors-lint); the worker fills the bodies and never
 * renames a case.
 */
import { describe, it } from 'vitest';

describe('every door is a seam', () => {
  it.todo('outside src/seams no module imports the SDK client, opens a socket, spawns a process, or reads a file outside the project folder');
  it.todo('the named exceptions are exactly the modules a pose can never reach - the EAS hooks, showError, and the devtools - each with its reason');
  it.todo('a new module that imports the SDK client outside src/seams fails the lint by name');
  it.todo('the staged run opens its build through the server seam, never through a client of its own');
});
