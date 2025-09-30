/**
 * Parses update info message string into message, timeAgo and author parts
 *
 * @example
 * Input: '"EAS Update" (1 day ago by github-actions (robot))'
 * Output: {
 *   message: '"EAS Update"',
 *   timeAgo: '1 day ago',
 *   author: 'github-actions (robot)'
 * }
 */
function parseUpdateInfoMessageString(input: string): {
  message: string;
  timeAgo?: string;
  author?: string;
} {
  const separator = ' by ';
  const lastChar = ')';
  const lastCharIndex = input.length - 1;

  // Validate that string ends with ")"
  if (input[lastCharIndex] !== lastChar) {
    return { message: input };
  }

  // Using lastIndexOf because message can contain " by " but we want the last
  // one which separates the timestamp from the author
  const separatorIndex = input.lastIndexOf(separator);
  if (separatorIndex === -1) {
    return { message: input };
  }

  const firstParenthesisBeforeSeparator = input.lastIndexOf('(', separatorIndex);
  if (firstParenthesisBeforeSeparator === -1) {
    return { message: input };
  }

  return {
    message: input.slice(0, firstParenthesisBeforeSeparator - 1),
    timeAgo: input.slice(firstParenthesisBeforeSeparator + 1, separatorIndex),
    author: input.slice(separatorIndex + separator.length, lastCharIndex),
  };
}

export default parseUpdateInfoMessageString;
