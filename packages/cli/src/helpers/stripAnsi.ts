/**
 * Removes ANSI escape codes (color codes) from a string
 */
function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
}

export default stripAnsi;
