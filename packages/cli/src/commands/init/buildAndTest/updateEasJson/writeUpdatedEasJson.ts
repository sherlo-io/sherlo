import { readFile, writeFile } from 'fs/promises';
import { getEnhancedError, throwError } from '../../../../helpers';
import getBuildProfileName from './getBuildProfileName';
import getBuildProfileConfig from './getBuildProfileConfig';
import getEasJsonPath from './getEasJsonPath';
import hasEasJsonFile from './hasEasJsonFile';
import readEasJson from './readEasJson';

async function writeUpdatedEasJson(): Promise<void> {
  const easJson = hasEasJsonFile() ? await readEasJson() : {};
  const profileName = getBuildProfileName();

  // Create a deep copy of the existing JSON
  const updatedEasJson = { ...easJson };

  // Ensure the build section exists
  updatedEasJson.build = updatedEasJson.build || {};

  // Add the profile configuration dynamically
  updatedEasJson.build[profileName] = {
    ...getBuildProfileConfig(),
  };

  await writeEasJson(updatedEasJson);
}

export default writeUpdatedEasJson;

/* ========================================================================== */

async function writeEasJson(easJson: Record<string, any>): Promise<void> {
  const easJsonPath = getEasJsonPath();
  const indentStyle = await getIndentStyle();

  try {
    await writeFile(easJsonPath, JSON.stringify(easJson, null, indentStyle));
  } catch (error) {
    throwError({ type: 'unexpected', error });
  }
}

async function getIndentStyle(): Promise<string> {
  const defaultIndentStyle = '  '; // Default to 2 spaces

  if (!hasEasJsonFile()) return defaultIndentStyle;

  const easJsonPath = getEasJsonPath();

  let easJsonContent;
  try {
    easJsonContent = await readFile(easJsonPath, 'utf-8');
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getEnhancedError(`Invalid ${easJsonPath}`, error),
    });
  }

  /**
   * Look for a pattern:
   * newline followed by whitespace(s) followed by a non-whitespace character
   *
   * \n - newline
   * (\s+) - capturing group for one or more whitespace chars
   * \S - any non-whitespace char
   */
  const indentMatch = easJsonContent.match(/\n(\s+)\S/);

  if (indentMatch && indentMatch[1]) {
    return indentMatch[1];
  }

  return defaultIndentStyle;
}
