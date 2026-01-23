import throwError from './throwError';

const TIMEOUT_IN_MINUTES = 30;

/**
 * Wraps a command function with a timeout mechanism.
 * If the command execution exceeds the timeout (30 minutes), it will throw a TimeoutError.
 */
function withCommandTimeout<T, P>(commandFn: (options: P) => Promise<T>) {
  return async (options: P): Promise<T> => {
    let timeoutId: number | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new TimeoutError(
            `Command timed out after ${TIMEOUT_IN_MINUTES} minutes; Please try again or contact us if the issue persists`
          )
        );
      }, TIMEOUT_IN_MINUTES * 60 * 1000);
    });

    try {
      // Race between the command execution and timeout
      return await Promise.race([commandFn(options), timeoutPromise]);
    } catch (error) {
      // Only handle TimeoutError here, let other errors propagate normally
      if (error instanceof TimeoutError) {
        console.log();

        throwError({
          type: 'unexpected',
          error,
        });
      }

      throw error;
    } finally {
      // Clear timeout if command completes successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
}

export default withCommandTimeout;

/* ========================================================================== */

/**
 * Custom error class for command timeout
 */
class TimeoutError extends Error {
  code: number;

  constructor(message: string, code = 124) {
    super(message);
    this.name = 'TimeoutError';
    this.code = code;
  }
}
