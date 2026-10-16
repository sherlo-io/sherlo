/**
 * `sherlo pose <pose.json...> --screens-to <dir>` - draw many poses in ONE process, each screen
 * written to its own file.
 *
 * WHY. A caller that needs hundreds of screens paid a whole process per pose: node starting and
 * the CLI bundle loading cost more than the drawing itself. One process pays that once.
 *
 * WHAT A FILE HOLDS IS WHAT ONE RUN PRINTS. Each pose is drawn by running THIS tool's own routing
 * on exactly the command line a one-pose run gets (`sherlo pose <file> [--no-terminal]`), with the
 * process's two streams and `process.exit` stood in for. So a file's `stdout`, `stderr` and
 * `exitCode` are the bytes and the code `sherlo pose <file>` gives as a process of its own -
 * refusals included: an unreadable document, a call the pose could not answer, a missing file.
 *
 * A file is named after the pose file's own base name, so two poses with one base name are refused
 * before anything is drawn.
 */
import fs from 'fs';
import path from 'path';
import { Console } from 'console';
import { Writable } from 'stream';
import start from '../../start';

/** What one pose's own run would have printed, and how it ended. */
export type OneRunScreen = { stdout: string; stderr: string; exitCode: number };

export async function poseMany(
  documentPaths: string[],
  { screensTo, terminal }: { screensTo: string; terminal: boolean }
): Promise<void> {
  const names = documentPaths.map((documentPath) => path.basename(documentPath));
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated !== undefined) {
    throw new Error(`Two poses share the file name ${repeated}; each screen is written under it.`);
  }
  if (documentPaths.includes('-')) {
    throw new Error('A pose read from stdin is drawn alone, without --screens-to.');
  }

  fs.mkdirSync(screensTo, { recursive: true });

  for (const [index, documentPath] of documentPaths.entries()) {
    const screen = await runAsItsOwnProcess([
      'pose',
      documentPath,
      ...(terminal ? [] : ['--no-terminal']),
    ]);
    fs.writeFileSync(path.join(screensTo, names[index]), `${JSON.stringify(screen)}\n`);
  }
}

/** Thrown in place of ending this process when the run being drawn exits. */
class RunExited extends Error {
  constructor(code: number) {
    super(`the run exited with ${code}`);
    Object.assign(this, { skipReporting: true });
  }
}

/**
 * Run this tool's routing on `words` as if it were a process of its own, and answer what that
 * process would have written to each stream and the code it would have ended with.
 *
 * THE FIRST EXIT ENDS THE RUN: a real `process.exit` ends the output right there, so every write
 * after it is dropped, as is anything still settling one turn of the event loop later.
 */
async function runAsItsOwnProcess(words: string[]): Promise<OneRunScreen> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;

  const into =
    (buffer: string[]) =>
    (chunk: unknown, ...rest: unknown[]): boolean => {
      if (exitCode === undefined) {
        buffer.push(
          typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8')
        );
      }
      const callback = rest.find((argument) => typeof argument === 'function');
      if (callback) (callback as () => void)();
      return true;
    };
  const streamInto = (buffer: string[]) =>
    new Writable({
      write(chunk, _encoding, callback) {
        into(buffer)(chunk);
        callback();
      },
    });

  const realConsole = globalThis.console;
  const realExit = process.exit;
  const realArgv = process.argv;
  const realWrites = [process.stdout, process.stderr].map((stream) => ({
    stream,
    descriptor: Object.getOwnPropertyDescriptor(stream, 'write'),
  }));

  globalThis.console = new Console({ stdout: streamInto(stdout), stderr: streamInto(stderr) });
  process.stdout.write = into(stdout) as typeof process.stdout.write;
  process.stderr.write = into(stderr) as typeof process.stderr.write;
  process.exit = ((code?: number) => {
    if (exitCode === undefined) exitCode = code ?? 0;
    throw new RunExited(code ?? 0);
  }) as typeof process.exit;
  process.argv = [realArgv[0], realArgv[1], ...words];

  try {
    await start();
  } catch {
    // Every exit unwinds through here; the code is the first one recorded.
  } finally {
    await new Promise((resolve) => setImmediate(resolve));
    process.argv = realArgv;
    process.exit = realExit;
    for (const { stream, descriptor } of realWrites) {
      if (descriptor) Object.defineProperty(stream, 'write', descriptor);
      else delete (stream as unknown as Record<string, unknown>).write;
    }
    globalThis.console = realConsole;
  }

  // A process whose command returned without exiting ends with 0.
  return { stdout: stdout.join(''), stderr: stderr.join(''), exitCode: exitCode ?? 0 };
}
