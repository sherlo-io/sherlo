import path from 'path';
import throwError from '../../../throwError';
import runShellCommand from '../../../runShellCommand';

async function compressDirectoryToTarGzip({
  directoryPath,
  projectRoot,
}: {
  directoryPath: string;
  projectRoot: string;
}): Promise<Buffer> {
  /**
   * Create tar command that outputs gzipped tar to stdout:
   * -c: create new archive
   * -z: compress using gzip
   * -f -: write to stdout (- is a special file meaning stdout)
   * -C dir: change to directory before adding files (preserves relative paths)
   * last arg: file/directory to add to archive
   *
   * Example for path "/foo/bar/myapp.app":
   * - changes to "/foo/bar" directory (-C)
   * - adds "myapp.app" to archive
   * - results in archive with single top-level "myapp.app" entry
   */
  const command = `tar -czf - -C "${path.dirname(directoryPath)}" "${path.basename(
    directoryPath
  )}"`;

  let output;
  try {
    output = await runShellCommand({ command, encoding: 'buffer', projectRoot });
  } catch (error) {
    throwError({ type: 'unexpected', error });
  }

  return output;
}

export default compressDirectoryToTarGzip;
