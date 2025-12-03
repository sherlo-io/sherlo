/**
 * Story ID normalization utilities
 * Converts file paths to Storybook-compatible story IDs
 */

import * as path from 'path';

/**
 * Extracts component name from story file path
 * Storybook uses the full path hierarchy for story IDs
 * Example: "components-button" from "/project/src/components/Button/Button.stories.tsx"
 *
 * @param filePath - The absolute path to the story file
 * @param projectRoot - The project root directory
 * @returns The normalized story ID prefix (kebab-case)
 */
export function getComponentNameFromPath(filePath: string, projectRoot: string): string {
  // Get relative path from project root
  const relativePath = path.relative(projectRoot, filePath);

  // Remove the filename and extension
  const dirPath = path.dirname(relativePath);
  const fileName = path.basename(filePath);
  const match = fileName.match(/(.*)\.stories\.(ts|tsx|js|jsx)$/);
  const componentName = match ? match[1] : fileName;

  // Storybook uses the directory path as the story ID prefix, not including the component name again
  // Example: "src/components/Button/Button.stories.tsx" -> "components-button"
  // The directory path already contains the component directory, so we don't append it again
  // Remove "src/" prefix and normalize to kebab-case
  let fullPath = dirPath;
  if (fullPath.startsWith('src/')) {
    fullPath = fullPath.substring(4); // Remove "src/" prefix
  }
  if (fullPath.startsWith('src\\')) {
    fullPath = fullPath.substring(4); // Remove "src\" prefix (Windows)
  }

  return fullPath.replace(/\//g, '-').replace(/\\/g, '-').toLowerCase();
}

/**
 * Converts camelCase to kebab-case
 * Example: "MockedDefault" -> "mocked-default"
 *
 * @param str - The camelCase string to convert
 * @returns The kebab-case string
 */
export function camelToKebab(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2') // Insert hyphen between lowercase and uppercase
    .toLowerCase();
}

/**
 * Checks if a file is a story file
 *
 * @param filename - The file path to check
 * @param storyFiles - Array of known story file paths
 * @returns True if the file is a story file
 */
export function isStoryFile(filename: string, storyFiles: string[]): boolean {
  const normalizedPath = path.resolve(filename);
  return storyFiles.some((storyFile) => path.resolve(storyFile) === normalizedPath);
}

