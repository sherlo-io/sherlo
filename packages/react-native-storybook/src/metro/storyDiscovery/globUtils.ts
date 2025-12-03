/**
 * Glob pattern utilities
 * Converts glob patterns to regex for file matching
 */

/**
 * Converts a glob pattern to a regex pattern.
 * This is a simplified glob matcher for common story file patterns.
 *
 * @param globPattern - The glob pattern to convert (e.g., '../src/star-star/*.stories.?(ts|tsx)')
 * @returns A RegExp that matches the glob pattern
 */
export function globToRegex(globPattern: string): RegExp {
  // Escape special regex characters except * and ?
  let regex = globPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*')
    .replace(/\?/g, '.');

  // Handle ?(ts|tsx) patterns - convert to (ts|tsx)?
  regex = regex.replace(/\(([^)]+)\)/g, '($1)?');

  return new RegExp(`^${regex}$`);
}

