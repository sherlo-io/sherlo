/**
 * THE PROMPT THAT CANCELLED A SETUP NOBODY MEANT TO CANCEL (2026-08-26).
 *
 * `sherlo init` pauses on "Ready to move on? Press Enter..." so a developer can act on the Storybook
 * Access instructions before the run continues. It decided whether to pause from `process.stdin.isTTY`
 * alone, and that question is NOT the question it meant to ask. Plenty of automation runs a CLI under
 * a PSEUDO-TERMINAL - `docker run -t`, `script(1)`, expect, any tool that records terminal output - and
 * under one of those stdin is a tty with nobody behind it.
 *
 * The failure mode was not a hang, which is what one would expect and would at least be obvious. Such
 * a stdin reaches EOF at once, a pty signals EOF by delivering the end-of-transmission byte (4), and
 * `waitForEnterPress` reads raw keys and treats 4 as CTRL+D - a deliberate cancel. So `sherlo init`
 * printed the prompt, read the EOT, and aborted with "Setup cancelled", writing no sherlo.config.json.
 *
 * It was found by sherlo-tester's E2E suite, whose cast recorder had just started running init through
 * script(1) to record a replay: cli/init/02 went red with "sherlo.config.json does not exist". A real
 * customer reaches it the same way, with a `docker run -t` build step and no E2E suite to notice.
 *
 * These cases pin the DECISION rather than the prompt's bytes, because the decision is the whole bug -
 * the prompt itself was always correct for the case it was written for.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import waitForEnterPress from '../waitForEnterPress';

/**
 * Present the ambient stdin/stdout/env a run would see, and undo it afterwards.
 *
 * `isTTY` is a plain property on the real streams, so it is set directly and restored by the
 * `afterEach` below rather than through a mock - the module under test reads `process.stdin` at call
 * time, not at import time.
 */
function givenEnvironment({ stdinIsTTY, ci }: { stdinIsTTY: boolean; ci?: string }): void {
  Object.defineProperty(process.stdin, 'isTTY', { value: stdinIsTTY, configurable: true });
  if (ci === undefined) delete process.env.CI;
  else process.env.CI = ci;
}

const originalIsTTY = process.stdin.isTTY;
const originalCi = process.env.CI;

afterEach(() => {
  Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
  if (originalCi === undefined) delete process.env.CI;
  else process.env.CI = originalCi;
  vi.restoreAllMocks();
});

/**
 * Did the call return without ever touching the terminal?
 *
 * Returning is not by itself proof of a skip - a resolved prompt returns too. The proof is that
 * `setRawMode` was never called: everything that made this bug possible (raw keys, the EOT read as
 * CTRL+D) lives behind that one call, so a run that never makes it cannot cancel a setup.
 */
async function skippedThePrompt(): Promise<boolean> {
  const setRawMode = vi.spyOn(process.stdin, 'setRawMode').mockReturnValue(process.stdin);
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

  await waitForEnterPress();

  const promptWasShown = write.mock.calls.some(([chunk]) => String(chunk).includes('Press Enter'));
  return setRawMode.mock.calls.length === 0 && !promptWasShown;
}

describe('waitForEnterPress prompts only when someone could answer', () => {
  it('skips the prompt when stdin is a pipe (the plain non-interactive case)', async () => {
    givenEnvironment({ stdinIsTTY: false });

    await expect(skippedThePrompt()).resolves.toBe(true);
  });

  // THE REGRESSION CASE. A tty AND CI - which is precisely what script(1), `docker run -t` and every
  // other pty-allocating pipeline presents. Before the fix this fell straight through the isTTY guard,
  // printed the prompt, and cancelled the setup on the pty's end-of-transmission byte.
  it('skips the prompt under CI even though stdin is a tty', async () => {
    givenEnvironment({ stdinIsTTY: true, ci: 'true' });

    await expect(skippedThePrompt()).resolves.toBe(true);
  });

  // The control on the other side: without this, a guard that simply never prompted would pass every
  // case above and silently delete the feature.
  it('still prompts for a real developer at a terminal with no CI set', async () => {
    givenEnvironment({ stdinIsTTY: true, ci: undefined });

    const setRawMode = vi.spyOn(process.stdin, 'setRawMode').mockReturnValue(process.stdin);
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin);
    // The prompt never resolves on its own, so the Enter key is delivered to the listener it
    // registers; without this the case would hang rather than fail.
    vi.spyOn(process.stdin, 'on').mockImplementation(((event: string, listener: (key: Buffer) => void) => {
      if (event === 'data') setImmediate(() => listener(Buffer.from([13])));
      return process.stdin;
    }) as typeof process.stdin.on);
    vi.spyOn(process.stdin, 'removeListener').mockReturnValue(process.stdin);
    vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin);

    await waitForEnterPress();

    expect(setRawMode).toHaveBeenCalledWith(true);
    expect(write.mock.calls.some(([chunk]) => String(chunk).includes('Press Enter'))).toBe(true);
  });
});
