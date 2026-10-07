/**
 * `sherlo pose --no-terminal` (sherlo / Drawing for a plan): the screen an agent or a CI log
 * receives - the same run, with the streams answering as a pipe instead of a terminal.
 */
import { describe, it } from 'vitest';

describe('sherlo pose --no-terminal', () => {
  it.todo('with --no-terminal the streams answer as a pipe: not a terminal, no width, no cursor moves');
  it.todo("with --no-terminal colour is off unless the pose's own settings force it");
});
