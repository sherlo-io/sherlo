import { afterEach, describe, expect, it, vi } from 'vitest';
import exitAfterOutput from '../exitAfterOutput';

afterEach(() => {
  vi.restoreAllMocks();
});

/** A stdout and stderr whose queued bytes are taken only when the test lets them go. */
function pipesThatTakeTheirTime() {
  const releases: (() => void)[] = [];
  const hold = (() => (_chunk: unknown, callback?: () => void) => {
    if (callback) releases.push(callback);
    return true;
  }) as unknown as () => never;
  vi.spyOn(process.stdout, 'write').mockImplementation(hold());
  vi.spyOn(process.stderr, 'write').mockImplementation(hold());
  return releases;
}

describe('the exit that waits for the output', () => {
  it('ends the process only after stdout and stderr have taken every queued byte', async () => {
    const releases = pipesThatTakeTheirTime();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    const ended = exitAfterOutput(3);
    await new Promise((resolve) => setImmediate(resolve));
    expect(
      exit,
      'the bytes are still queued, so the process must still be alive'
    ).not.toHaveBeenCalled();

    releases.forEach((release) => release());
    await ended;
    expect(exit).toHaveBeenCalledExactlyOnceWith(3);
  });
});
