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
  // Redirect stderr to null to suppress logs and warning messages
  // const silentCommand =
  //   process.platform === 'win32' ? `${command} 2>NUL` : `${command} 2>/dev/null`;

  return (
    execSync(command, {
      encoding: 'utf8',
      cwd: projectRoot,
    })
      // Remove leading/trailing whitespace from output
      .trim()
  );
}

export default runShellCommand;
