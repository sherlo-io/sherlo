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
