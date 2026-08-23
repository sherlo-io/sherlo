/**
 * Print machine-readable `key=value` lines on stdout - the CI-agnostic form of a
 * command's answer (SHERLO-1692).
 *
 * The CLI publishes its answers ONE way: as plain stdout lines. Whatever CI the
 * caller runs (GitHub Actions, GitLab, Buildkite, a local script) reads the lines
 * and republishes them in its own vocabulary - the GitHub Action in this repo
 * turns them into step outputs. The CLI knows nothing about $GITHUB_OUTPUT.
 *
 * A key with no value is not printed: an absent answer must read as absent, never
 * as an empty one.
 *
 * Values are newline-stripped so a multi-line reason can never break the
 * `key=value` line format a parser depends on.
 */
function printOutputKeys(entries: Record<string, string | number | boolean | undefined>): void {
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === '') continue;

    console.log(`${key}=${String(value).replace(/\r?\n/g, ' ')}`);
  }
}

export default printOutputKeys;
