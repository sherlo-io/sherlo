/**
 * Strips PII (absolute device filesystem paths) from JS stack traces before
 * they are sent to the Sherlo backend.
 *
 * Handles:
 *   iOS dev    "address at /Users/<name>/Library/…/Application Support/…/bundle:l:c"
 *   iOS preview "/Users/<name>/Library/…/bundle.jsbundle:l:c"
 *   Android    "address at /data/user/0/<pkg>/files/…/<hexhash>:l:c"
 *
 * The paren-bounded regex `\([^)]*\/([^)/]+)\)` works correctly even when
 * directory names contain spaces (e.g. "Application Support") because `[^)]*`
 * matches any non-`)` character. Greedy backtracking finds the last `/` in the
 * group, so only the basename + :line:col is preserved.
 */
export function normalizeStack(stack: string): string {
  if (!stack) return stack;
  return stack
    // Strip 'address at ' prefix added by iOS dev builds
    .replace(/address at /g, '')
    // Replace absolute filesystem path (everything up to and including the last /)
    // with just the filename + optional :line:col inside each () group
    .replace(/\([^)]*\/([^)/]+)\)/g, '($1)');
}
