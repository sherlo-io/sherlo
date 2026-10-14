/**
 * Converts a size in bytes to MB
 * @returns Formatted size in MB with 2 decimal places
 */
function getSizeInMB({ bytes }: { bytes: number }): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

export default getSizeInMB;
