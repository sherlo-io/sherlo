/**
 * Read what `sherlo test` said, and decide whether it said anything at all.
 *
 * The CLI publishes its answers as CI-AGNOSTIC `key=value` lines on stdout (see
 * packages/cli/src/helpers/printOutputKeys.ts). This module is the GitHub half of
 * that contract: it parses those lines and formats them for the file named by
 * $GITHUB_OUTPUT, which is what makes them `steps.<id>.outputs.<key>`.
 *
 * ROUTE ON THE KEY, NOT ON THE EXIT CODE. `sherlo test` exits 4 when a native
 * build is needed - an EXPECTED answer, not a failure - so a naive gate would
 * fail the whole workflow on any native change. The discriminator between an
 * answer and a crash is the OUTPUT: a real decision always prints
 * `native-needed=...`, a genuine tool error (bad token, network failure) throws
 * and prints nothing.
 */

/** The exit code `sherlo test` uses for "a native build is needed first". */
export const EXIT_NATIVE_NEEDED = 4;

/** Every output this action exposes: the three routing keys the CLI prints, and the review address. */
export const OUTPUT_KEYS = ['native-needed', 'reason', 'base-fingerprint', 'url'];

/** The routing keys, printed as `key=value` lines. */
const KEY_LINE_KEYS = ['native-needed', 'reason', 'base-fingerprint'];

/**
 * THE REVIEW ADDRESS IS READ OFF THE `🔗` LINE (operator ruling 2026-09-15). A run that reached a
 * build prints its address once, on the line with the emoji (`🔗 <url>` on the standard road,
 * `🔗 Review: <url>` on the staged one), and never as a `url=` line - the same address twice on a
 * screen was the defect. The address is the last `http(s)://` word on that line.
 */
const LINK_LINE_PATTERN = /^\u{1F517}\s.*?(https?:\/\/\S+)\s*$/u;

/** Colour codes, so a coloured line still parses (the CLI drops colour off a TTY). */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Every published output found in the CLI's screen, as a plain object. An output the CLI
 * did not print is ABSENT - never an empty string, which a caller could not tell
 * from a real empty answer.
 *
 * An output printed more than once keeps its LAST value: later output describes a
 * later stage of the same run.
 */
export function parseCliOutputs(output) {
  const outputs = {};

  for (const rawLine of String(output).split('\n')) {
    const line = rawLine.replace(ANSI_PATTERN, '').trim();

    const link = LINK_LINE_PATTERN.exec(line);
    if (link) {
      outputs.url = link[1];
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator);
    if (!KEY_LINE_KEYS.includes(key)) continue;

    outputs[key] = line.slice(separator + 1);
  }

  return outputs;
}

/**
 * What to do with a finished `sherlo test`: return its published keys, or throw
 * because it never answered.
 *
 * - exit 0                           -> the run completed (either road).
 * - exit 4 WITH `native-needed=true` -> a clean routing answer. Not a failure:
 *                                       the caller's next job builds natively
 *                                       and re-runs with the build paths.
 * - anything else                    -> a genuine tool error. Throws, so the
 *                                       action fails loudly instead of reporting
 *                                       a decision nobody made.
 */
export function readRunResult({ exitCode, output }) {
  const outputs = parseCliOutputs(output);

  if (exitCode === 0) return { outputs };

  if (exitCode === EXIT_NATIVE_NEEDED && outputs['native-needed'] === 'true') {
    return { outputs };
  }

  throw new Error(
    outputs['native-needed'] === undefined
      ? `sherlo test exited ${exitCode} without answering whether a native build is needed, ` +
        'so it hit a genuine error (bad token, network failure, misconfiguration) rather than ' +
        'making a decision. See the CLI output above.'
      : `sherlo test published native-needed=${outputs['native-needed']} but exited ${exitCode}, ` +
        'which is not a routing outcome. See the CLI output above.'
  );
}

/**
 * The published keys as lines for the $GITHUB_OUTPUT file.
 *
 * Values are newline-stripped so a multi-line value can never break the
 * `key=value` line format GitHub parses - a broken line would silently become a
 * different output, or none at all.
 */
export function formatOutputFileLines(outputs) {
  const lines = Object.entries(outputs)
    .filter(([key]) => OUTPUT_KEYS.includes(key))
    .map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, ' ')}`);

  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}
