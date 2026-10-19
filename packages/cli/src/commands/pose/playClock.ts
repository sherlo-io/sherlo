/**
 * THE PLAY CLOCK - what a posed run waits on when it is PLAYED rather than printed once.
 *
 * A still pose never lets time pass: a poll's sleep returns at once and a spinner never ticks (see
 * {@link holdTheRedrawsStill}). A played pose lets time pass in one fixed step. Every wait the
 * pose itself scripts - a poll's sleep, a server's answer, a spinner's timer - comes due after
 * {@link PLAY_WAIT_MS} of VIRTUAL time, so a played run takes as long as a still one, and the time
 * stamps on what it wrote are the same on every machine. A wait on the browser, a file or the
 * bundler is real and is not shortened: only intervals are replaced, never `setTimeout`.
 */
import fs from 'fs';
import path from 'path';

/** How long every wait takes, in virtual milliseconds. */
export const PLAY_WAIT_MS = 2000;

export type PlayClock = {
  /** Virtual milliseconds since the run began. */
  now(): number;
  /** Let one wait pass: time moves on {@link PLAY_WAIT_MS} and every live timer ticks once. */
  pass(): Promise<void>;
  /** Stand-in `setInterval` for the run: a real, never-due, unreferenced timer that `pass` ticks. */
  setInterval(callback: () => void): { unref(): unknown };
  /** Stand-in `clearInterval`: stops the ticking, and clears the real timer under it. */
  clearInterval(timer: unknown): void;
};

export function createPlayClock(
  realClearInterval: (timer: never) => void,
  realSetInterval: (callback: () => void, delay: number) => { unref(): unknown }
): PlayClock {
  /** The longest delay a timer takes. One set for it is one that never comes due. */
  const NEVER = 2 ** 31 - 1;

  let virtualNow = 0;
  const live = new Map<unknown, () => void>();

  return {
    now: () => virtualNow,

    pass: async () => {
      virtualNow += PLAY_WAIT_MS;
      for (const tick of [...live.values()]) tick();
    },

    setInterval: (callback) => {
      const timer = realSetInterval(() => undefined, NEVER);
      timer.unref();
      live.set(timer, callback);
      return timer;
    },

    clearInterval: (timer) => {
      live.delete(timer);
      realClearInterval(timer as never);
    },
  };
}

/** One write the played run made, with the virtual time it was made at. */
export type PlayChunk = { atMs: number; data: string };

/**
 * The cast of a played run: asciinema v2, the shape sherlo-tester's `buildCast`
 * (e2e/helpers/cli-cast.ts) writes - a header line, then one `[seconds, "o", data]` line per write.
 * Writes as given: the caller masks them first (see {@link cutAtTerminators}).
 */
export function buildPlayCast(params: {
  chunks: PlayChunk[];
  command: string;
  width: number;
  height?: number;
  startedAtEpochSeconds?: number;
}): string {
  const header = {
    version: 2,
    width: params.width,
    height: params.height ?? 24,
    timestamp: params.startedAtEpochSeconds ?? 0,
    env: { TERM: 'xterm-256color' },
    command: params.command,
  };

  const lines = [JSON.stringify(header)];
  for (const { atMs, data } of params.chunks) {
    if (data === '') continue;
    lines.push(JSON.stringify([Math.round(atMs * 1000) / 1_000_000, 'o', data]));
  }

  return lines.join('\n') + '\n';
}

/** The text a cast replays to: every event's data, in order. */
export function castText(cast: string): string {
  return cast
    .split('\n')
    .slice(1)
    .filter((line) => line !== '')
    .map((line) => (JSON.parse(line) as [number, string, string])[2])
    .join('');
}

/**
 * Cut a played run's writes at terminators: after every line end (`\n`, `\r`, `\r\n`) and around
 * every cursor move or show/hide escape (a redraw goes back to the line's start, as `\r` does;
 * colour escapes are not cut, a mask may read them). A secret can straddle two writes and half of
 * one matches no mask, so a mask is applied to these pieces and never to the writes as they came.
 * No secret spans a terminator, so masking the pieces is masking the whole text. A piece is stamped
 * with the time of the write its first byte came in, so a spinner's frame keeps its own tick.
 */
export function cutAtTerminators(chunks: readonly PlayChunk[]): PlayChunk[] {
  const text = chunks.map(({ data }) => data).join('');
  const startOfWrite: Array<{ offset: number; atMs: number }> = [];
  let offset = 0;
  for (const { atMs, data } of chunks) {
    startOfWrite.push({ offset, atMs });
    offset += data.length;
  }

  const pieces: PlayChunk[] = [];
  let pieceStart = 0;
  const atMsOf = (at: number) => startOfWrite.filter((write) => write.offset <= at).pop()!.atMs;
  const cutAt = (end: number) => {
    if (end > pieceStart) {
      pieces.push({ atMs: atMsOf(pieceStart), data: text.slice(pieceStart, end) });
    }
    pieceStart = end;
  };

  // eslint-disable-next-line no-control-regex -- the escape character is what is looked for
  for (const match of text.matchAll(/\r\n|\r|\n|\u001b\[[0-9;?]*[A-LN-Za-ln-z]/g)) {
    const isEscape = match[0].startsWith('\u001b');
    if (isEscape) cutAt(match.index);
    cutAt(match.index + match[0].length);
  }
  cutAt(text.length);

  return pieces;
}

/** The writes a cast carries: cut at terminators, then each piece through `mask`. */
export function maskedPlayChunks(
  chunks: readonly PlayChunk[],
  mask: (text: string) => string
): PlayChunk[] {
  return cutAtTerminators(chunks).map(({ atMs, data }) => ({ atMs, data: mask(data) }));
}

/** Write the cast of `chunks` to `castFile`, making its folder first when it is missing. */
export function writePlayCast(castFile: string, chunks: PlayChunk[], width: number): void {
  fs.mkdirSync(path.dirname(path.resolve(castFile)), { recursive: true });
  fs.writeFileSync(castFile, buildPlayCast({ chunks, command: 'npx sherlo pose', width }));
}

type IntervalGlobals = {
  setInterval: (callback: () => void, delay: number) => { unref(): unknown };
  clearInterval: (timer: never) => void;
};

/**
 * Put the play clock's interval timers on the global scope for one run; `restore` takes them off.
 * ONLY INTERVALS ARE REPLACED, and only a spinner's library sets one. Every `setTimeout` stays the
 * real one, so a wait on the browser, a file or the bundler really takes the time it takes.
 */
export function playingTheClock(): { clock: PlayClock; restore: () => void } {
  const globals = globalThis as unknown as IntervalGlobals;
  const realSetInterval = globals.setInterval;
  const realClearInterval = globals.clearInterval;
  const clock = createPlayClock(realClearInterval, realSetInterval);

  globals.setInterval = (callback) => clock.setInterval(callback);
  globals.clearInterval = clock.clearInterval;

  return {
    clock,
    restore: () => {
      globals.setInterval = realSetInterval;
      globals.clearInterval = realClearInterval;
    },
  };
}

/**
 * A still posed screen is drawn ONCE, so nothing on it may be redrawn on a timer.
 *
 * THE SPINNER IS WHY. `sherlo init` draws its steps with a spinner, and a spinner advances its
 * frame on an interval - so the bytes a run committed would be whichever frame the machine
 * happened to reach. The frame drawn when the step STARTS is the whole of what a single-instant
 * transcript can honestly hold, and that one is drawn straight away, before any interval is asked for.
 *
 * So for the length of the run, an interval is set for longer than the run can last and released
 * from holding the process open. It is a REAL timer, so whoever asked for it can hold it, clear it
 * and unreference it exactly as always, and it simply never comes due. Returns the way back.
 */
export function holdTheRedrawsStill(): () => void {
  /** The longest delay a timer takes. One set for it is one that never comes due. */
  const NEVER = 2 ** 31 - 1;

  const globals = globalThis as unknown as IntervalGlobals;
  const realSetInterval = globals.setInterval;

  globals.setInterval = () => {
    const timer = realSetInterval(() => undefined, NEVER);
    timer.unref();

    return timer;
  };

  return () => {
    globals.setInterval = realSetInterval;
  };
}

/**
 * A played run's server answers each come due after the fixed wait. A still run (no clock) is
 * handed back as it is.
 */
export function answeringAfterTheWait<Calls extends object>(
  calls: Calls,
  clock: PlayClock | undefined
): Calls {
  if (!clock) return calls;

  return new Proxy(calls, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver);
      if (typeof member !== 'function' || property === 'refusals' || property === 'unusedCalls') {
        return member;
      }
      return async (...args: unknown[]) => {
        await clock.pass();
        return member.apply(target, args);
      };
    },
  });
}
