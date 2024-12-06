import { execSync } from 'child_process';

interface Options {
  command: string;
  projectRoot: string;
  encoding?: 'utf8' | 'buffer';
}

/**
 * Executes a shell command with suppressed stderr output
 * @returns The command output with removed leading/trailing whitespace
 */
export function runShellCommand(options: Options & { encoding?: 'utf8' }): string;
export function runShellCommand(options: Options & { encoding: 'buffer' }): Buffer;
export function runShellCommand({
  command,
  projectRoot,
  encoding = 'utf8',
}: Options): string | Buffer {
  const output = execSync(command, {
    encoding: encoding,
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'], // ['stdin', 'stdout', 'stderr'] - pipe all to suppress output but still capture errors
    maxBuffer: 1 * 1024 * 1024 * 1024, // 1GB max buffer - very safe limit
  });

  return typeof output === 'string' ? output.trim() : output;
}

export default runShellCommand;
