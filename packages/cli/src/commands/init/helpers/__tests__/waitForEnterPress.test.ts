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
 * The terminal calls a run made, and whether the prompt was ever shown.
 *
 * STUBBED BY DEFINITION, NOT BY SPY, and the difference is not stylistic: `setRawMode` exists on
 * `process.stdin` only when stdin really is a tty, so under CI - where this suite actually runs, on a
 * pipe - `vi.spyOn(process.stdin, 'setRawMode')` throws "The property setRawMode is not defined on
 * the object" before the case under test ever runs. Defining the properties outright lets the same
 * cases run identically on a laptop and in CI, which for a test ABOUT interactivity detection is the
 * one property it cannot afford to lack.
 */
type TerminalCalls = { rawModeSet: boolean; promptShown: boolean };

const ORIGINAL_CI = process.env.CI;
const restorers: (() => void)[] = [];

/** Replace one property on an object, remembering how to put it back. */
function stub(target: object, property: string, value: unknown): void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { value, configurable: true, writable: true });
  restorers.push(() => {
    if (original) Object.defineProperty(target, property, original);
    else delete (target as Record<string, unknown>)[property];
  });
}

afterEach(() => {
  while (restorers.length) restorers.pop()!();
  if (ORIGINAL_CI === undefined) delete process.env.CI;
  else process.env.CI = ORIGINAL_CI;
  vi.restoreAllMocks();
});

/**
 * Run `waitForEnterPress` against a scripted terminal and report what it touched.
 *
 * `answerWithEnter` decides whether the registered key listener is ever fed a key. It must be true
 * for the interactive case - that prompt never resolves on its own, so without a key the case would
 * hang rather than fail - and is irrelevant to the skip cases, which never register a listener at all.
 */
async function runWith({
  stdinIsTTY,
  ci,
  answerWithEnter = false,
}: {
  stdinIsTTY: boolean;
  ci?: string;
  answerWithEnter?: boolean;
}): Promise<TerminalCalls> {
  const calls: TerminalCalls = { rawModeSet: false, promptShown: false };

  stub(process.stdin, 'isTTY', stdinIsTTY);
  if (ci === undefined) delete process.env.CI;
  else process.env.CI = ci;

  stub(process.stdin, 'setRawMode', () => {
    calls.rawModeSet = true;
    return process.stdin;
  });
  stub(process.stdin, 'resume', () => process.stdin);
  stub(process.stdin, 'pause', () => process.stdin);
  stub(process.stdin, 'removeListener', () => process.stdin);
  stub(process.stdin, 'on', (event: string, listener: (key: Buffer) => void) => {
    if (event === 'data' && answerWithEnter) setImmediate(() => listener(Buffer.from([13])));
    return process.stdin;
  });
  stub(process.stdout, 'write', (chunk: unknown) => {
    if (String(chunk).includes('Press Enter')) calls.promptShown = true;
    return true;
  });

  await waitForEnterPress();

  return calls;
}

describe('waitForEnterPress prompts only when someone could answer', () => {
  it('skips the prompt when stdin is a pipe (the plain non-interactive case)', async () => {
    // Returning is not by itself proof of a skip - a resolved prompt returns too. The proof is that
    // raw mode was never entered: everything that made this bug possible (raw keys, the EOT read as
    // CTRL+D) lives behind that one call, so a run that never makes it cannot cancel a setup.
    await expect(runWith({ stdinIsTTY: false })).resolves.toEqual({
      rawModeSet: false,
      promptShown: false,
    });
  });

  // THE REGRESSION CASE. A tty AND CI - precisely what script(1), `docker run -t` and every other
  // pty-allocating pipeline presents. Before the fix this fell straight through the isTTY guard,
  // printed the prompt, and cancelled the setup on the pty's end-of-transmission byte.
  it('skips the prompt under CI even though stdin is a tty', async () => {
    await expect(runWith({ stdinIsTTY: true, ci: 'true' })).resolves.toEqual({
      rawModeSet: false,
      promptShown: false,
    });
  });

  // The control on the other side: without this, a guard that simply never prompted would pass both
  // cases above and silently delete the feature.
  it('still prompts for a real developer at a terminal with no CI set', async () => {
    await expect(
      runWith({ stdinIsTTY: true, ci: undefined, answerWithEnter: true })
    ).resolves.toEqual({ rawModeSet: true, promptShown: true });
  });
});
