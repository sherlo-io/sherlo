import chalk from 'chalk';
import printLink from './printLink';
import reporting from './reporting';

type Params = StandardErrorParams | UnexpectedErrorParams;

type StandardErrorParams = {
  message: string;
  errorToReport?: Error;
  learnMoreLink?: string;
  type?: Extract<ErrorType, 'default' | 'auth'>;
};

type UnexpectedErrorParams = {
  error: Error & { stdout?: string; stderr?: string };
  type: Extract<ErrorType, 'unexpected'>;
};

type ErrorType = 'default' | 'auth' | 'unexpected';

function throwError(params: Params): never {
  reportError(params);

  const error: Error & { skipReporting?: boolean } = new Error(getErrorMessage(params));
  error.skipReporting = true; // Error has been already reported above

  throw error;
}

export default throwError;

/* ========================================================================== */

const LABEL: { [type in ErrorType]: string } = {
  default: 'ERROR',
  auth: 'AUTH ERROR',
  unexpected: 'UNEXPECTED ERROR',
};

function getErrorMessage(params: Params): string {
  let message: string;
  if (params.type !== 'unexpected') {
    message = params.message;
  } else {
    message = params.error.message;
  }

  const messageWithLabel = chalk.red(`${LABEL[params.type ?? 'default']}: ${message.trim()}`);

  const errorMessageParts = [messageWithLabel];

  if (params.type === 'unexpected') {
    const errorLocation = getErrorLocation();
    if (errorLocation) errorMessageParts.push(chalk.dim(`(in ${errorLocation})`));

    const { stdout, stderr } = params.error;
    if (stdout) errorMessageParts.push(`\n${stdout}`);
    if (stderr) errorMessageParts.push(`\n${stderr}`);
  } else if (params.learnMoreLink) {
    errorMessageParts.push(chalk.dim(`↳ Learn more: ${printLink(params.learnMoreLink)}`));
  }

  return errorMessageParts.join('\n') + '\n';
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
