/**
 * THE LIVE LOG PUSH SEAM - a plain plug point, nothing more. captureTransport.ts is what plugs a
 * real pusher in while a capture is waiting; this only proves the seam itself forwards (or, with
 * nothing plugged in, quietly does not).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { pushAppLogLine, setCaptureLogSink } from '../helpers/RunnerBridge/captureLogSink';

beforeEach(() => {
  setCaptureLogSink(undefined);
});

describe('the seam a capture plugs its live pusher into', () => {
  it('forwards every line to whichever sink is registered', () => {
    const received: string[] = [];
    setCaptureLogSink((line) => received.push(line));

    pushAppLogLine('first line');
    pushAppLogLine('second line');

    expect(received).toEqual(['first line', 'second line']);
  });

  it('does nothing, and does not throw, with no sink registered', () => {
    expect(() => pushAppLogLine('nobody is listening')).not.toThrow();
  });

  it('a sink can be swapped out - the previous one stops receiving lines', () => {
    const first: string[] = [];
    const second: string[] = [];
    setCaptureLogSink((line) => first.push(line));
    setCaptureLogSink((line) => second.push(line));

    pushAppLogLine('after the swap');

    expect(first).toEqual([]);
    expect(second).toEqual(['after the swap']);
  });
});
