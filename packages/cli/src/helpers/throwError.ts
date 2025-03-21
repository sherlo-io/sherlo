import chalk from 'chalk';
import printLink from './printLink';

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
  let unexpectedError: (Error & { stdout?: string; stderr?: string }) | undefined;
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

  const errorMessage = chalk.red(`${LABEL[type]}: ${message.trim()}`);

  const lines = [errorMessage];

  if (unexpectedError) {
    const location = getCallerLocation();
    const { stdout, stderr } = unexpectedError;

    if (location) lines.push(chalk.dim(`(in ${location})`));

    if (stdout) lines.push(`\n${stdout}`);

    if (stderr) lines.push(`\n${stderr}`);

    Object.assign(unexpectedError, { location });
  }

  if (learnMoreLink) {
    lines.push(chalk.dim(`↳ Learn more: ${printLink(learnMoreLink)}`));
  }

  const error = new Error(lines.join('\n') + '\n');
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
