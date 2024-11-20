import { execSync } from 'child_process';

interface RunShellCommandOptions {
  command: string;
  projectRoot: string;
}

/**
 * Executes a shell command with UTF-8 encoding and suppressed stderr output
 * @returns The command output with removed leading/trailing whitespace
 */
export function runShellCommand({ command, projectRoot }: RunShellCommandOptions): string {
  return (
    execSync(command, {
      encoding: 'utf8',
      cwd: projectRoot,
      // ['stdin', 'stdout', 'stderr'] - pipe all to suppress output but still capture errors
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      // Remove leading/trailing whitespace from output
      .trim()
  );
}

export default runShellCommand;
