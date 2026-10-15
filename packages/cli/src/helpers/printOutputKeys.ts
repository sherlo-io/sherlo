import { emit } from './transcriptSink';

/**
 * Print machine-readable `key=value` lines on stdout - the CI-agnostic form of a
 * command's answer (SHERLO-1692).
 *
 * The CLI publishes its answers ONE way: as plain stdout lines. Whatever CI the
 * caller runs (GitHub Actions, GitLab, Buildkite, a local script) reads the lines
 * and republishes them in its own vocabulary - the GitHub Action in this repo
 * turns them into step outputs. The CLI knows nothing about $GITHUB_OUTPUT.
 *
 * The skipping rule - a key with no value is not printed, so an absent answer
 * reads as absent rather than as an empty one - lives with the bytes, in
 * ../render/pushSpine.
 */
function printOutputKeys(entries: Record<string, string | number | boolean | undefined>): void {
  emit({ kind: 'output-keys', entries });
}

export default printOutputKeys;
