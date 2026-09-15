/**
 * `sherlo pose <pose.json|->` - run ONE command against a declared world and print the whole
 * screen it put on a terminal, with the exit code the real run would have had.
 *
 * THE COMMAND'S CODE IS THE SHIPPED CODE. What a pose replaces is the four seams a command
 * reaches through, each installed here for the length of one run and taken out afterwards:
 *
 *     ../../seams/projectFiles   the folder it reads
 *     ../../seams/surroundings   the settings it reads, and what git answers
 *     ../../seams/bundler        what bundling answers
 *     ../../seams/serverCalls    what the backend answers
 *
 * Everything between those seams - the routing in ../../start, the checks, the logo, the
 * wording, the help footer, the exit code - is the customer's road, unforked. That is what makes
 * a rendered screen evidence about the tool rather than about the caller who posed it.
 *
 * ------------------------------------------------------------------------
 * HOW THE SCREEN IS CAPTURED, AND WHY IT IS ONE STRING.
 *
 * Both streams are captured into ONE buffer (see {@link captureBothStreams}). A terminal has one
 * screen, and a transcript that kept two would have to invent an order for them; this keeps the
 * order the process actually wrote in, which is the order a person saw.
 *
 * `process.exit` is intercepted, because a posed run must not end this process - and every write
 * AFTER the first exit is discarded, because a real `process.exit` ends the output right there.
 * That is what lets the shipped code keep running into its own catch blocks without a single one
 * of them reaching a screen the real run would not have shown.
 */
import fs from 'fs';
import { Console } from 'console';
import { Writable } from 'stream';
import chalk from 'chalk';
import start from '../../start';
import { installProjectFiles, posedProjectFiles } from '../../seams/projectFiles';
import { installSurroundings, posedSurroundings } from '../../seams/surroundings';
import { installBundler, posedBundler } from '../../seams/bundler';
import { installServerCalls, posedServerCalls } from '../../seams/serverCalls';
import { readPoseDocument, type CommandPose } from './readPose';
import resolveConfigPath from '../../helpers/getValidatedCommandParams/getNormalizedConfig/resolveConfigPath';

/**
 * The width a posed screen is drawn at.
 *
 * The boxed refusals wrap to the terminal's own width, so a screen rendered at whatever window
 * the renderer happened to have would not be the screen anybody else gets. Eighty is what a pty
 * with no window size reports, which is the width the pty ratchet compares against.
 */
const POSED_TERMINAL_WIDTH = 80;

/** What one posed run printed, and how it ended. */
export type PosedScreen = {
  /** Both streams, in the order they were written, with the masks applied. */
  screen: string;
  /** The exit code the real run would have had. */
  exitCode: number;
  /** Calls the command made that the pose could not answer. */
  refusals: Array<{ call: string; problem: string }>;
  /**
   * Answers the pose scripted that the command never asked for.
   *
   * The mirror of a refusal, and worth the same attention: a pose that scripts a call its
   * command never makes is describing a road the run did not take, so whoever reads its screen
   * is reading a different scenario from the one the pose says it is.
   */
  unusedCalls: Array<{ call: string }>;
};

/**
 * Run the command a pose declares and return the whole screen it printed.
 *
 * Pure in the sense that matters: it writes nothing to this process's own streams and never ends
 * it. The command line is the pose's; this process's own arguments are not visible to the
 * command at all.
 */
export async function runPose(commandPose: CommandPose): Promise<PosedScreen> {
  const files = posedProjectFiles(commandPose.files);
  const api = posedServerCalls(commandPose.api);
  const world = posedSurroundings({ env: commandPose.env, git: commandPose.git });

  const uninstall = [
    installProjectFiles(files),
    installSurroundings(world),
    installBundler(posedBundler(commandPose.bundles)),
    installServerCalls(api),
    // The settings go in LAST and come out FIRST: the folder above is laid out while this
    // process still has its own environment, and nothing after this line should.
    world.installSettings(),
  ];

  // Resolved while the posed folder is installed, because that is what it resolves FROM - and
  // the screen it is folded out of is read after the seams have been taken out again.
  const configPath = resolvedConfigPath(commandPose.argv);

  const capture = captureBothStreams();
  const restoreArgv = installArgv(commandPose.argv);
  const restoreColour = forceColour();

  let threw = false;
  try {
    await start();
  } catch {
    // Every ending comes back through here - the posed `process.exit` throws to unwind the stack
    // - so the code is read off the capture, which recorded the FIRST one.
    threw = true;
  } finally {
    restoreColour();
    restoreArgv();
    capture.restore();
    for (const undo of [...uninstall].reverse()) undo();
  }

  const screen = applyMasks(capture.screen(), commandPose, { root: files.root(), configPath });
  files.remove();

  // A run that neither exited nor threw ran to the end of its command, which is an exit of 0.
  return {
    screen,
    exitCode: capture.exitCode() ?? (threw ? 1 : 0),
    refusals: api.refusals(),
    unusedCalls: api.unusedCalls(),
  };
}

/**
 * `sherlo pose <pose.json|->` - the command. Reads the document, runs it, prints the screen it
 * produced on stdout, and exits with the code the posed run would have had.
 *
 * A call the command made that the pose did not script is a REFUSAL: the screen so far is
 * printed, then the refusal under it, and the exit code is 1. A screen that stopped because the
 * world could not answer is still worth reading - it is the evidence that says which call to add.
 */
export async function pose(documentPath: string): Promise<void> {
  const document = documentPath === '-' ? readStdin() : fs.readFileSync(documentPath, 'utf8');

  const { screen, exitCode, refusals } = await runPose(readPoseDocument(document));

  process.stdout.write(screen);

  if (refusals.length > 0) {
    process.stdout.write(formatRefusals(refusals));
    process.exit(1);
  }

  process.exit(exitCode);
}

export default pose;

/** The refusal block printed under the screen so far. */
export function formatRefusals(refusals: Array<{ call: string; problem: string }>): string {
  return (
    '\nTHE POSE COULD NOT ANSWER THIS RUN. The screen above is everything the command printed ' +
    'before it asked:\n' +
    refusals.map(({ call, problem }) => `  - \`${call}\`: ${problem}\n`).join('')
  );
}

/* ========================================================================== */

/** Thrown in place of ending this process when the posed command exits. */
class ExitSignal extends Error {
  readonly code: number;

  constructor(code: number) {
    super(`the posed command exited with ${code}`);
    this.name = 'ExitSignal';
    this.code = code;
    // The shipped catch blocks report what they could not handle; a posed exit is not that.
    Object.assign(this, { skipReporting: true });
  }
}

/**
 * Capture both streams into one buffer, and stand in for `process.exit`.
 *
 * TWO THINGS WRITE TO A SCREEN AND BOTH ARE CAUGHT HERE. Nearly everything the tool prints goes
 * through `console`, and the refusal minter writes to `process.stdout` directly - so the console
 * is replaced with one whose streams are this buffer, and the process's own two streams are
 * pointed at the same buffer. One buffer, so the order is the order the process wrote in, which
 * is the order a person saw.
 *
 * The console is REPLACED rather than its methods wrapped, because a test runner installs a
 * console of its own that never reaches `process.stdout` - a capture that only watched the
 * streams would record an empty screen under one and a full screen under the other.
 *
 * The buffer's streams SAY THEY ARE A TERMINAL, and so do the process's for the length of the
 * run: a screen is drawn for a terminal, and the parts of the tool that ask (the box that wraps
 * to the window, the error output that dims itself for a pipe) have to get a terminal's answer
 * or the screen is not the one a person gets.
 *
 * Once the posed command has exited, every further write is DROPPED: the shipped code keeps
 * running (a `process.exit` that returns is a `process.exit` nothing below it expects), and
 * anything it prints from there belongs to no screen a real user ever saw.
 */
function captureBothStreams(): {
  screen: () => string;
  exitCode: () => number | undefined;
  restore: () => void;
} {
  const written: string[] = [];
  let firstExitCode: number | undefined;

  const collect = (text: string): void => {
    if (firstExitCode === undefined) written.push(text);
  };

  const collector = () => {
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        collect(chunk.toString('utf8'));
        callback();
      },
    }) as Writable & { isTTY: boolean; columns: number };

    stream.isTTY = true;
    stream.columns = POSED_TERMINAL_WIDTH;

    return stream;
  };

  const realConsole = globalThis.console;
  const realExit = process.exit;
  // The DESCRIPTORS, not bound copies: `write` is inherited from the stream's prototype unless
  // something has already replaced it, and putting a bound copy back would leave this process
  // subtly changed - an own property where there was none, and a different function object.
  const realWrites = [process.stdout, process.stderr].map((stream) => ({
    stream,
    descriptor: Object.getOwnPropertyDescriptor(stream, 'write'),
  }));
  const restoreTerminal = pretendTheStreamsAreATerminal();

  const capturingWrite = (chunk: unknown, ...rest: unknown[]): boolean => {
    collect(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'));

    // `write` takes an optional callback in either argument position; a caller that passed one is
    // waiting for it.
    const callback = rest.find((argument) => typeof argument === 'function');
    if (callback) (callback as () => void)();

    return true;
  };

  globalThis.console = new Console({ stdout: collector(), stderr: collector() });
  process.stdout.write = capturingWrite as typeof process.stdout.write;
  process.stderr.write = capturingWrite as typeof process.stderr.write;
  // THE FIRST EXIT IS THE RUN'S EXIT. The shipped catch blocks keep running after it and call
  // `process.exit` again with a code of their own - a real process would already be gone, so the
  // first code is the one this run ended with, and the later ones only unwind the stack.
  process.exit = ((code?: number) => {
    if (firstExitCode === undefined) firstExitCode = code ?? 0;
    throw new ExitSignal(code ?? 0);
  }) as typeof process.exit;

  return {
    screen: () => written.join(''),
    exitCode: () => firstExitCode,
    restore: () => {
      globalThis.console = realConsole;
      for (const { stream, descriptor } of realWrites) restoreProperty(stream, 'write', descriptor);
      process.exit = realExit;
      restoreTerminal();
    },
  };
}

/**
 * Make `process.stdout` and `process.stderr` answer as a terminal of a fixed width, and give back
 * whatever they said before.
 *
 * The width is fixed rather than inherited because the boxed refusals wrap to it: a screen
 * rendered at whatever window the renderer happened to have would not be the screen anybody else
 * gets, and the committed catalogue would change with the reader.
 */
function pretendTheStreamsAreATerminal(): () => void {
  const previous = [process.stdout, process.stderr].map((stream) => ({
    stream,
    isTTY: Object.getOwnPropertyDescriptor(stream, 'isTTY'),
    columns: Object.getOwnPropertyDescriptor(stream, 'columns'),
  }));

  for (const { stream } of previous) {
    Object.defineProperty(stream, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(stream, 'columns', {
      value: POSED_TERMINAL_WIDTH,
      configurable: true,
    });
  }

  return () => {
    for (const { stream, isTTY, columns } of previous) {
      restoreProperty(stream, 'isTTY', isTTY);
      restoreProperty(stream, 'columns', columns);
    }
  };
}

function restoreProperty(
  host: object,
  name: string,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) Object.defineProperty(host, name, descriptor);
  else delete (host as Record<string, unknown>)[name];
}

/** The command line the routing parses: this tool's own name, then the pose's words. */
function installArgv(argv: string[]): () => void {
  const previous = process.argv;
  process.argv = [previous[0], 'sherlo', ...argv];
  return () => {
    process.argv = previous;
  };
}

/** Colour is forced ON: a screen is drawn for a terminal, and a pipe is not the audience. */
function forceColour(): () => void {
  const previous = chalk.level;
  chalk.level = 1;
  return () => {
    chalk.level = previous;
  };
}

/**
 * Fold the values only this machine knows out of the screen.
 *
 * THE TWO PATH FOLDS ARE NOT ASKED FOR - the tool always makes them, because a posed run's
 * project folder is a temporary directory with a random name in it and no transcript may carry
 * one. The CONFIG PATH goes first because it sits inside the project root, and folding the root
 * first would leave half a path behind.
 *
 * The pose's own masks go LAST, each one replacing the literal the pose itself put on the screen
 * - a token, a commit, a build file name - with the placeholder it named.
 */
export function applyMasks(
  screen: string,
  commandPose: CommandPose,
  machineOnly: { root: string; configPath: string }
): string {
  let masked = screen.split(machineOnly.configPath).join('<SHERLO_CONFIG_PATH>');
  masked = masked.split(machineOnly.root).join('<PROJECT_ROOT>');

  for (const [placeholder, literal] of Object.entries(commandPose.masks)) {
    masked = masked.split(literal).join(placeholder);
  }

  return masked;
}

/**
 * The config file path this command line resolves to - through the tool's OWN resolver, so the
 * fold can never name a path the tool would not have named.
 *
 * Read off the pose's command line rather than reported back by the run, because a run that
 * refuses before it reads a config file never resolves one - and that is exactly the run whose
 * screen names the path.
 */
export function resolvedConfigPath(argv: string[]): string {
  return resolveConfigPath({
    projectRoot: valueOf(argv, 'projectRoot'),
    config: valueOf(argv, 'config'),
  });
}

/** The value of `--name value` or `--name=value` on a command line, or undefined. */
function valueOf(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index !== -1) return argv[index + 1];

  const joined = argv.find((word) => word.startsWith(`--${name}=`));
  return joined?.slice(`--${name}=`.length);
}

/** Read the whole of stdin, for `sherlo pose -`. */
function readStdin(): string {
  return fs.readFileSync(0, 'utf8');
}
