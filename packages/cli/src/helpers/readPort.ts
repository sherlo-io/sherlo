/**
 * The bundler port a command was passed with `--port`, or the default one when none was.
 */
import { DEFAULT_BUNDLER_PORT, PORT_OPTION } from '../constants';
import { throwError } from '.';

export function readPort(passed: string | undefined): number {
  if (passed === undefined) return DEFAULT_BUNDLER_PORT;

  const port = Number(passed);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throwError({
      message: `\`--${PORT_OPTION}\` takes a port number, and \`${passed}\` is not one.`,
    });
  }

  return port;
}
