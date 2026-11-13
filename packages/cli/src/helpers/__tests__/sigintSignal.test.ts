import { describe, expect, it } from 'vitest';
import { createSigintSignal } from '../sigintSignal';

describe('the Ctrl-C a wait listens for', () => {
  it('resolves on the first Ctrl-C and gives the signal back on cleanup', async () => {
    const listenersBefore = process.listenerCount('SIGINT');
    const sigint = createSigintSignal();
    expect(process.listenerCount('SIGINT')).toBe(listenersBefore + 1);

    process.emit('SIGINT', 'SIGINT');
    await expect(sigint.promise).resolves.toBeUndefined();

    sigint.cleanup();
    expect(process.listenerCount('SIGINT')).toBe(listenersBefore);
  });

  it('cleanup before any Ctrl-C removes the listener', () => {
    const listenersBefore = process.listenerCount('SIGINT');
    createSigintSignal().cleanup();
    expect(process.listenerCount('SIGINT')).toBe(listenersBefore);
  });
});
