import path from 'path';
import { symbolicated } from './symbolicateStack';

/**
 * An error as the app tells it over the capture socket: its name and message, and - when the app
 * sent them - where it came from: the component stack and the top frames of the error's stack.
 * `--json` prints all of it; what the terminal prints stays the name and message alone.
 */
export type AppError = {
  name: string;
  message: string;
  /** The React components the error passed through, innermost first, as the app wrote them. */
  componentStack?: string;
  /** The first few frames of the error's own stack, one line each. */
  topFrames?: string[];
  /** The source file and line the crash came from, read through the bundle's source map. */
  file?: string;
  line?: number;
  /** The data the app was reading when it hit undefined, as the error's message names it. */
  dataPath?: string;
};

/** How many frames of an error's stack `--json` carries. */
const TOP_FRAME_COUNT = 5;

/**
 * What the app said its story threw, or what it said crashed, in its own words - or nothing when
 * it said nothing readable. The name and message are the whole of it unless the app also sent a
 * component stack or a stack, which come along as they are.
 */
export function readAppError(said: unknown): AppError | undefined {
  const error = said as
    | { name?: unknown; message?: unknown; componentStack?: unknown; stack?: unknown }
    | null
    | undefined;
  if (typeof error?.name !== 'string' || typeof error?.message !== 'string') return undefined;

  const componentStack =
    typeof error.componentStack === 'string' && error.componentStack.trim()
      ? error.componentStack
      : undefined;
  const topFrames =
    typeof error.stack === 'string'
      ? error.stack
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('at '))
          .slice(0, TOP_FRAME_COUNT)
      : [];

  return {
    name: error.name,
    message: error.message,
    ...(componentStack && { componentStack }),
    ...(topFrames.length > 0 && { topFrames }),
  };
}

/** The data a crash message says the app was reading when it hit undefined; nothing when it names none. */
export function dataPathOf(message: string): string | undefined {
  // JavaScriptCore: "undefined is not an object (evaluating 'user.profile.name')".
  const evaluating = /\(evaluating '([^']+)'\)/.exec(message);
  if (evaluating) return evaluating[1].replace(/^_?this\./, '');
  // V8 and Hermes: "Cannot read properties of undefined (reading 'name')" and "Cannot read property 'name' of undefined".
  const reading =
    /\(reading '([^']+)'\)/.exec(message) ??
    /Cannot read propert(?:y|ies) '([^']+)' of /.exec(message);
  return reading?.[1];
}

/** A stack line as the bundler maps it: at method (/abs/path/File.tsx:12:3). */
const MAPPED_FRAME = /\((\/[^()]+):(\d+):\d+\)\s*$/;

/**
 * The same error with where it crashed: the first frame of its stack that lies in the app's own
 * code (read through the bundler on the port, which maps the bundle's offset to the source file),
 * as a file relative to the root and a line, and the data path its message names. The frames are
 * spent once read, so they leave. A bundler that cannot map them leaves the file and line out.
 */
export async function nameWhereItCrashed(
  error: AppError,
  port: number,
  root: string
): Promise<AppError> {
  const { topFrames, ...rest } = error;
  const mapped = topFrames?.length
    ? (await symbolicated(topFrames.join('\n'), port)).split('\n')
    : [];
  const inTheApp = mapped
    .map((frame) => MAPPED_FRAME.exec(frame))
    .find((found) => found && !found[1].includes('/node_modules/'));
  const dataPath = dataPathOf(error.message);
  return {
    ...rest,
    ...(inTheApp && { file: path.relative(root, inTheApp[1]), line: Number(inTheApp[2]) }),
    ...(dataPath && { dataPath }),
  };
}
