import { exec, ExecException } from 'child_process';

/**
 * Executes a command with the given options
 */
function executeCommand({
  command,
  projectRoot,
  encoding,
  env,
  envMode = 'merge',
}: {
  command: string;
  projectRoot: string;
  encoding: 'utf8' | 'buffer';
  env?: NodeJS.ProcessEnv;
  /**
   * How `env` combines with the CLI's ambient environment:
   *   - 'merge'   (default): `{ ...process.env, ...env }` - inherit everything.
   *   - 'replace': `{ ...env }` ONLY - the child gets exactly what is passed and
   *     does NOT inherit the ambient env. Used where subprocess output must be
   *     deterministic across commands regardless of the env the CLI was launched
   *     with (SHERLO-1744 - the autolinking resolve subprocess).
   */
  envMode?: 'merge' | 'replace';
}): Promise<string | Buffer> {
  return new Promise((resolve, reject) => {
    const options: {
      cwd: string;
      maxBuffer: number;
      encoding?: BufferEncoding | null;
      env: NodeJS.ProcessEnv;
    } = {
      cwd: projectRoot,
      maxBuffer: 1 * 1024 * 1024 * 1024, // 1GB max buffer - very safe limit
      env:
        envMode === 'replace'
          ? { FORCE_COLOR: 'true', ...env }
          : { ...process.env, FORCE_COLOR: 'true', ...env },
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
            ...error,
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

export default executeCommand;
