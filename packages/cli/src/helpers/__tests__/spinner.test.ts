/**
 * A pty whose window size was never set (a container run without `-t`, some CI images,
 * `script(1)`) reports `process.stdout.columns` as `0`, not `undefined`. ora sizes its clear-line
 * count from `stream.columns ?? 80`, and `??` only falls back on `null`/`undefined` - the `0`
 * survives, dividing the line width by it produces `Infinity`, and every animation frame then
 * loops `Infinity` times writing a clear escape. This suite drives `spinner` directly with a fake
 * stream whose `columns` is `0` and asserts it behaves exactly as it would on a real 80-column
 * terminal: a finite, single clear per rendered frame.
 */
import { describe, expect, it } from 'vitest';
import spinner from '../spinner';

describe('the spinner helper treats an unknown-width terminal as 80 columns, not zero', () => {
  it('a spinner on a stream that reports zero columns animates as on an 80-column terminal and never writes more than one clear per frame', () => {
    const zeroColumnsStream = createFakeStream(0);
    const eightyColumnsStream = createFakeStream(80);

    const zeroColumnsSpinner = spinner({
      text: 'Checking requirements',
      isEnabled: true,
      stream: zeroColumnsStream as unknown as NodeJS.WritableStream,
    });
    const eightyColumnsSpinner = spinner({
      text: 'Checking requirements',
      isEnabled: true,
      stream: eightyColumnsStream as unknown as NodeJS.WritableStream,
    });

    const framesToRender = 5;
    const zeroColumnsClearsPerFrame: number[] = [];
    const eightyColumnsClearsPerFrame: number[] = [];

    for (let frame = 0; frame < framesToRender; frame++) {
      zeroColumnsStream.clearLineCalls = 0;
      eightyColumnsStream.clearLineCalls = 0;

      zeroColumnsSpinner.render();
      eightyColumnsSpinner.render();

      zeroColumnsClearsPerFrame.push(zeroColumnsStream.clearLineCalls);
      eightyColumnsClearsPerFrame.push(eightyColumnsStream.clearLineCalls);
    }

    expect(zeroColumnsClearsPerFrame.every((count) => count <= 1)).toBe(true);
    expect(zeroColumnsClearsPerFrame).toEqual(eightyColumnsClearsPerFrame);
  });
});

/* ========================================================================== */

function createFakeStream(columns: number) {
  return {
    columns,
    isTTY: true,
    clearLineCalls: 0,
    write() {
      return true;
    },
    cursorTo() {},
    moveCursor() {},
    clearLine() {
      this.clearLineCalls += 1;
    },
  };
}
