import runShellCommand from '../../runShellCommand';
import throwError from '../../throwError';

async function getSizeInMB({
  path,
  buffer,
  projectRoot,
}: {
  path?: string;
  buffer?: Buffer;
  projectRoot: string;
}): Promise<string> {
  if (buffer) {
    return convertToMB(buffer.length, 'B'); // bytes to MB
  }

  if (path) {
    let output;
    try {
      output = await runShellCommand({
        command: `du -sk "${path}"`,
        projectRoot,
      });
    } catch (error) {
      throwError({ type: 'unexpected', error });
    }

    const [sizeInKBString] = output.split('\t');
    const sizeInKB = parseInt(sizeInKBString, 10);

    return convertToMB(sizeInKB, 'KB'); // KB to MB
  }

  throw new Error('Either path or buffer must be provided');
}

export default getSizeInMB;

/**
 * Converts size to MB from specified unit
 * @param size - Size in the specified unit
 * @param fromUnit - Source unit ('B' for bytes, 'KB' for kilobytes)
 * @returns Formatted size in MB with 2 decimal places
 */
function convertToMB(size: number, fromUnit: 'B' | 'KB'): string {
  const divisor = fromUnit === 'B' ? 1024 * 1024 : 1024;
  return (size / divisor).toFixed(2);
}
