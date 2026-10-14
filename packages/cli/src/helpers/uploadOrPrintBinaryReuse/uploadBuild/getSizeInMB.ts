/**
 * Converts a buffer's size in bytes to MB
 * @returns Formatted size in MB with 2 decimal places
 */
function getSizeInMB({ buffer }: { buffer: Buffer }): string {
  return (buffer.length / (1024 * 1024)).toFixed(2);
}

export default getSizeInMB;
