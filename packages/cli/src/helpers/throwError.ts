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
}: {
  message: string;
  learnMoreLink?: string;
  type?: ErrorType;
}): never {
  const errorMessageParts = [chalk.red(`${typeLabel[type]}: ${message}`)];

  if (type === 'unexpected') {
    const location = getCallerLocation();
    if (location) {
      errorMessageParts.push(chalk.dim(`(in ${location})`));
    }
  }

  const errorMessage = errorMessageParts.join(' ');

  const errorLines = [errorMessage];

  if (learnMoreLink) {
    errorLines.push(`↳ Learn more: ${getLogLink(learnMoreLink)}`);
  }

  throw new Error(errorLines.join('\n') + '\n');
}

export default throwError;

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
