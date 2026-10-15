/**
 * THE REFUSAL A SHERLO 2 CREDENTIAL MEETS.
 *
 * Sherlo 3 takes a push's credential from two places only: the project token in SHERLO_TOKEN, which
 * CI sets from its secrets, and the login a person saved with `sherlo login`. A command line that still passes `--token`, and a sherlo.config.json that still
 * holds `token`, are refused before anything runs, naming the two that remain - not commander's
 * bare "unknown option", and never skipped in silence, because a credential quietly ignored is a
 * push that lands somewhere its author did not mean.
 *
 * Pure, like the rest of the layer. THE TOKEN IS NOT AN INPUT: it is a live credential, and a
 * renderer that is never handed it cannot print it.
 */

/**
 * `ERROR: \`npx sherlo test\` no longer takes a token in \`--token\` or in sherlo.config.json.`,
 * then where each kind of run takes its credential now. The flag stays in backticks: a bare
 * `--token` followed by a word reads to the screen masker as a token being passed.
 */
export function renderTokenGone(command: string): { message: string; below: string } {
  return {
    message: `\`npx sherlo ${command}\` no longer takes a token in \`--token\` or in sherlo.config.json.`,
    below: [
      'In CI, set the project token in the SHERLO_TOKEN environment variable.',
      'On your own computer, run `npx sherlo login`.',
    ].join('\n'),
  };
}
