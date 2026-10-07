import { describe, it } from 'vitest';

/**
 * HOW A WHOLE SETUP RUN BEHAVES (epic init-for-agents): no question, one line per step, the
 * feedback line at the end, and our own message for every error. Shells written in plan; the
 * build makes each one a real test, keeping its name word for word.
 */
describe('sherlo init, end to end', () => {
  it.todo('init asks no question, even at a terminal');
  it.todo('prints one line per step, and marks a finished step (already done) on a rerun');
  it.todo('shows a spinner only in a real terminal, and a plain line otherwise');
  it.todo('ends every run, finished or failed, with the feedback line');
  it.todo('every error init can meet is caught and given our own message');
});
