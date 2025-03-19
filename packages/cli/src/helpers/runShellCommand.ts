import { exec, ExecException } from 'child_process';

interface Options {
  command: string;
  projectRoot: string;
  encoding?: 'utf8' | 'buffer';
}

/**
 * Executes a shell command asynchronously with suppressed stderr output
 * @returns Promise that resolves to the command output with removed leading/trailing whitespace
 */
async function runShellCommand(options: Options & { encoding?: 'utf8' }): Promise<string>;
async function runShellCommand(options: Options & { encoding: 'buffer' }): Promise<Buffer>;
async function runShellCommand({
  command,
  projectRoot,
  encoding = 'utf8',
}: Options): Promise<string | Buffer> {
  return new Promise((resolve, reject) => {
    const options: {
      cwd: string;
      maxBuffer: number;
      encoding?: BufferEncoding | null;
      env: NodeJS.ProcessEnv;
    } = {
      cwd: projectRoot,
      maxBuffer: 1 * 1024 * 1024 * 1024, // 1GB max buffer - very safe limit
      env: { ...process.env, FORCE_COLOR: 'true' },
    };

    // Set encoding only if it's 'utf8', for 'buffer' we don't set it to get Buffer output
    if (encoding === 'utf8') {
      options.encoding = 'utf8';
    } else {
      options.encoding = null; // This will make stdout a Buffer
    }

    exec(
      command,
      options,
      (error: ExecException | null, stdout: string | Buffer, stderr: string | Buffer) => {
        if (error) {
          const enhancedError = new Error(`\`${command}\` command failed`);

          const stdoutStr = stdout.toString('utf8').trim();
          const stderrStr = stderr.toString('utf8').trim();

          Object.assign(enhancedError, {
            stdout: stdoutStr.length > 0 ? stdoutStr : undefined,
            stderr: stderrStr.length > 0 ? stderrStr : undefined,
          });

          reject(enhancedError);
        }

        if (typeof stdout === 'string') {
          resolve(stdout.trim());
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

export default runShellCommand;
