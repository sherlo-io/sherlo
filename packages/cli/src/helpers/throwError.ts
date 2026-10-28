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
  error: Error & { stdout?: string; stderr?: string; cause?: unknown };
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

    const causeLine = describeCause(params.error.cause, 1);
    if (causeLine) errorMessageParts.push(chalk.dim(`cause: ${causeLine}`));

    const { stdout, stderr } = params.error;
    if (stdout) errorMessageParts.push(`\n${stdout}`);
    if (stderr) errorMessageParts.push(`\n${stderr}`);
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

/**
 * "code host:port - message" of a cause, each part skipped when missing, then the cause under it
 * once (a failed fetch hides its real reason in error.cause).
 */
function describeCause(cause: unknown, nestedLeft: number): string {
  if (!cause || typeof cause !== 'object') return '';
  const {
    code,
    address,
    hostname,
    port,
    message,
    cause: nested,
  } = cause as Record<string, unknown>;

  const host = address ?? hostname;
  const hostWithPort = host ? `${host}${port ? `:${port}` : ''}` : '';
  const technical = [code, hostWithPort].filter(Boolean).join(' ');
  const own = [technical, message].filter(Boolean).join(' - ');
  const inner = nestedLeft > 0 ? describeCause(nested, nestedLeft - 1) : '';

  return [own, inner].filter(Boolean).join(' <- ');
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
