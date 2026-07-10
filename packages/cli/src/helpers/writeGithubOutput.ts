/**
 * Append `key=value` lines to the GitHub Actions step-output file named by
 * `$GITHUB_OUTPUT` (SHERLO-1692).
 *
 * GitHub exposes each written key to later workflow steps as
 * `steps.<id>.outputs.<key>`, which is how a CI job routes on a Sherlo command's
 * decision. When `$GITHUB_OUTPUT` is unset (running outside GitHub Actions) this
 * is a no-op, so callers can write outputs unconditionally.
 *
 * Values are coerced to strings and newline-stripped so a multi-line reason can
 * never break the `key=value` line format.
 */
import fs from 'fs';

function writeGithubOutput(entries: Record<string, string | number | boolean>): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;

  const lines = Object.entries(entries)
    .map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, ' ')}`)
    .join('\n');

  fs.appendFileSync(outputPath, `${lines}\n`);
}

export default writeGithubOutput;
