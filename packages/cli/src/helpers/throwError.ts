import chalk from 'chalk';
import { blankSecrets } from './blankSecrets';
import printLink from './printLink';
import reporting from './reporting';

type Params = StandardErrorParams | UnexpectedErrorParams;

type StandardErrorParams = {
  message: string;
  above?: string;
  below?: string;
  errorToReport?: Error;
  learnMoreLink?: string;
  type?: Extract<ErrorType, 'default'>;
};

type UnexpectedErrorParams = {
  error: Error & { stdout?: string; stderr?: string };
  type: Extract<ErrorType, 'unexpected'>;
};

type ErrorType = 'default' | 'unexpected';

function throwError(params: Params): never {
  reportError(params);

  const error: Error & { skipReporting?: boolean; cause?: Error } = new Error(
    getErrorMessage(params)
  );
  error.skipReporting = true; // Error has been already reported above

  if (params.type === 'unexpected') {
    error.cause = params.error;
  } else if ('errorToReport' in params && params.errorToReport) {
    error.cause = params.errorToReport;
  }

  throw error;
}

export default throwError;

/* ========================================================================== */

/**
 * One prefix for every refusal a person can fix: a refused login reads `ERROR:` like any other.
 */
const LABEL: { [type in ErrorType]: string } = {
  default: 'ERROR',
  unexpected: 'UNEXPECTED ERROR',
};

/**
 * `ERROR: <first line>` in red, and the lines under it plain: only the line that says what went
 * wrong is red, and the fix under it reads as ordinary text, in every refusal at once.
 */
function labelled(label: string, message: string): string {
  const [firstLine, ...linesBelow] = `${label}: ${message.trim()}`.split('\n');
  return [chalk.red(firstLine), ...linesBelow].join('\n');
}

function getErrorMessage(params: Params): string {
  let message: string;
  if (params.type !== 'unexpected') {
    message = params.message;
  } else {
    message = params.error.message;
  }

  const messageWithLabel = labelled(LABEL[params.type ?? 'default'], message);

  const errorMessageParts: string[] = [];

  if (params.type !== 'unexpected' && params.above) {
    errorMessageParts.push(params.above + '\n');
  }

  errorMessageParts.push(messageWithLabel);

  if (params.type === 'unexpected') {
    const errorLocation = getErrorLocation();
    if (errorLocation) errorMessageParts.push(chalk.dim(`(in ${errorLocation})`));

    const { stdout, stderr } = params.error;
    if (stdout) errorMessageParts.push(`\n${stdout}`);
    if (stderr) errorMessageParts.push(`\n${stderr}`);

    // Node's fetch hides the host, the code and the reason one level down, in `cause`.
    const reason = describeCause(params.error.cause);
    if (reason) errorMessageParts.push(chalk.dim(`(cause: ${reason})`));
  } else {
    if (params.learnMoreLink) {
      errorMessageParts.push(chalk.dim(`↳ Learn more: ${printLink(params.learnMoreLink)}`));
    }
    if (params.below) {
      errorMessageParts.push(params.below);
    }
  }

  return blankSecrets(errorMessageParts.join('\n')) + '\n';
}

function describeCause(cause: unknown): string | null {
  if (!(cause instanceof Error)) return null;

  const { code, hostname, address, port } = cause as Error & {
    code?: string;
    hostname?: string;
    address?: string;
    port?: number;
  };
  const server = hostname ?? address;
  const where = server ? ` at ${server}${port ? `:${port}` : ''}` : '';

  return `${code ? `${code}: ` : ''}${cause.message}${where}`;
}

function reportError(params: Params) {
  let errorToReport: Error | undefined;

  if (params.type === 'unexpected') {
    errorToReport = params.error;
  } else if (params.errorToReport) {
    errorToReport = params.errorToReport;
  }

  if (errorToReport) {
    Object.assign(errorToReport, { location: getErrorLocation() });
    reporting.captureException(errorToReport);
  }
}

function getErrorLocation() {
  const stack = new Error().stack;
  if (!stack) return null;

  // Split the stack trace into lines
  const lines = stack.split('\n');

  // Find the first line that's not from throwError.ts
  // Skip first line (Error), throwError call, and look for actual source
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('throwError.ts')) {
      const match = line.match(/packages\/(.*?)\)/);
      return match?.[1]?.split('packages/')[0]?.replace(/\\/g, '/') ?? null;
    }
  }

  return null;
}
