import chalk from 'chalk';
import { getLogLink } from './shared';

type Params = StandardErrorParams | UnexpectedErrorParams;

type StandardErrorParams = {
  message: string;
  learnMoreLink?: string;
  type?: Extract<ErrorType, 'default' | 'auth'>;
};

type UnexpectedErrorParams = {
  error: Error;
  type: Extract<ErrorType, 'unexpected'>;
};

type ErrorType = 'default' | 'auth' | 'unexpected';

function throwError(params: Params): never {
  let type: ErrorType;
  let message: string;
  let unexpectedError: Error | undefined;
  let learnMoreLink: string | undefined;

  if (params.type === 'unexpected') {
    type = 'unexpected';
    unexpectedError = params.error;
    message = unexpectedError.message;
  } else {
    type = params.type ?? 'default';
    message = params.message;
    learnMoreLink = params.learnMoreLink;
  }

  const errorMessageParts = [chalk.red(`${LABEL[type]}: ${message}`)];

  if (type === 'unexpected') {
    const location = getCallerLocation();
    if (location) errorMessageParts.push(chalk.dim(`(in ${location})`));
  }

  const errorMessage = errorMessageParts.join(' ');

  const errorLines = [errorMessage];

  if (learnMoreLink) errorLines.push(`↳ Learn more: ${getLogLink(learnMoreLink)}`);

  const error = new Error(errorLines.join('\n') + '\n');
  if (unexpectedError) (error as any).unexpectedError = unexpectedError;

  throw error;
}

export default throwError;

/* ========================================================================== */

const LABEL: { [type in ErrorType]: string } = {
  default: 'ERROR',
  auth: 'AUTH ERROR',
  unexpected: 'UNEXPECTED ERROR',
};

function getCallerLocation() {
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
