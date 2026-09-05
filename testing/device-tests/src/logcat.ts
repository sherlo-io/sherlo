import { execFileSync, spawn } from 'node:child_process';
import { adbBinary } from './adb';

export interface LogCapture {
  /** Every line captured so far, oldest first. */
  lines(): string[];
  /** Stops the background adb process. Idempotent. */
  stop(): void;
}

/**
 * Clears the device log, then captures everything from that point on.
 *
 * Nothing is filtered: a test that asserts an absence (no Sherlo diagnostic
 * line reached a developer's console) can only do that honestly over the whole
 * log. Clearing first is what keeps that bounded - the capture holds one app
 * session, not the emulator's whole history.
 *
 * The FIRST `adb logcat` spawned shortly after a boot can attach before logd is
 * stable and exit immediately, which would leave the capture empty for the
 * whole run. Any unexpected exit is therefore re-attached until stop().
 */
export function startLogCapture(serial: string): LogCapture {
  const captured: string[] = [];
  let partialLine = '';
  let stopped = false;
  let child: ReturnType<typeof spawn> | undefined;

  const attach = (): void => {
    if (stopped) return;

    const logcat = spawn(adbBinary(), ['-s', serial, 'logcat', '-v', 'brief', '*:V'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    child = logcat;

    logcat.stdout?.on('data', (chunk: Buffer) => {
      const parts = (partialLine + chunk.toString('utf8')).split('\n');
      partialLine = parts.pop() ?? '';
      for (const line of parts) {
        if (line.trim() !== '') captured.push(line);
      }
    });

    const reattach = (): void => {
      if (stopped) return;
      // unref: a pending re-attach timer must never keep the process alive.
      setTimeout(attach, 500).unref();
    };
    logcat.on('exit', reattach);
    logcat.on('error', reattach);
  };

  execFileSync(adbBinary(), ['-s', serial, 'logcat', '-c'], { timeout: 15_000 });
  attach();

  return {
    lines: () => [...captured],
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        child?.kill();
      } catch {
        // Already gone.
      }
    },
  };
}
