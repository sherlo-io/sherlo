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
  try {
    return execSync(command, {
      encoding: 'utf8',
      cwd: projectRoot,
      // ['stdin', 'stdout', 'stderr'] - pipe all to suppress output but still capture errors
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error: any) {
    if (error.stderr) {
      console.error('\n\n\nerror.stderr.toString()', error.stderr.toString());
    }

    console.error('\n\n\nerror', error);

    throw error;
  }
}

export default runShellCommand;
