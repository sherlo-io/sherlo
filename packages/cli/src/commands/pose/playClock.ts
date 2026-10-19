/**
 * THE PLAY CLOCK - what a posed run waits on when it is PLAYED rather than printed once.
 *
 * A still pose never lets time pass: a poll's sleep returns at once and a spinner never ticks (see
 * `holdTheRedrawsStill` in ./pose). A played pose lets time pass in one fixed step. Every wait the
 * command makes - a poll's sleep, a server's answer, a spinner's timer - comes due after
 * {@link PLAY_WAIT_MS} of VIRTUAL time: no real timer is ever waited on, so a played run takes as
 * long as a still one, and the time stamps on what it wrote are the same on every machine.
 */

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
 * Unmasked: masking a stream cut into writes is that module's own job (it re-cuts at line ends).
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
