import chalk from 'chalk';
import { getLogLink } from './shared';

type ErrorType = 'default' | 'auth' | 'unexpected';

const typeLabel: { [type in ErrorType]: string } = {
  default: 'ERROR',
  auth: 'AUTH ERROR',
  unexpected: 'UNEXPECTED ERROR',
};

function throwError({
  learnMoreLink,
  message,
  type = 'default',
  originalError,
}: {
  message: string;
  learnMoreLink?: string;
  type?: ErrorType;
  originalError?: Error;
}): never {
  const errorMessageParts = [chalk.red(`${typeLabel[type]}: ${message}`)];

  let dontReportToSentry = false;

  if (type === 'unexpected') {
    const location = getCallerLocation();
    if (location) {
      errorMessageParts.push(chalk.dim(`(in ${location})`));
    }
  } else {
    dontReportToSentry = true;
  }

  const errorMessage = errorMessageParts.join(' ');

  const errorLines = [errorMessage];

  if (learnMoreLink) {
    errorLines.push(`↳ Learn more: ${getLogLink(learnMoreLink)}`);
  }

  const error = new SherloError(errorLines.join('\n') + '\n');

  if (originalError) {
    error.originalError = originalError;
  }

  error.dontReportToSentry = dontReportToSentry;

  throw error;
}

export default throwError;

class SherloError extends Error {
  dontReportToSentry = false;
  originalError?: Error;
}

/* ========================================================================== */

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
