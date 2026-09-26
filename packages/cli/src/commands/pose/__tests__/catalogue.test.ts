/**
 * THE POSE CATALOGUE LAW (sherlo / Drawing for a plan).
 *
 * Every pose under `packages/cli/poses/` renders, and the bytes it renders are committed beside
 * it as `<name>.txt`. Nothing here regenerates those bytes from a formula: the committed file IS
 * the evidence, produced by running the shipped command against the pose and reviewed into git
 * through whichever pull request touched it.
 *
 * ------------------------------------------------------------------------
 * RE-MINTING, WITH ONE COMMAND.
 *
 * When the tool's wording changes on purpose, the screens are re-minted in the SAME pull request
 * that changed it, with:
 *
 *     ALLOW_LOCAL_TEST_EXEC=1 MINT_POSES=1 yarn test src/commands/pose/__tests__/catalogue.test.ts
 *
 * and the diff is read like any other diff. Without `MINT_POSES` this file only ever compares -
 * a ratchet that could quietly rewrite its own baseline is not a ratchet.
 *
 * ------------------------------------------------------------------------
 * THIS CATALOGUE IS ANSI-PRESERVING.
 *
 * The screens are captured WITH colour. A hoisted newline, a moved style boundary or whitespace
 * inside a styled span moves real escape bytes, and the comparison below sees them. The case at
 * the bottom asserts that property rather than assuming it.
 */
import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { catalogue, renderPose } from '../catalogue';
import { runPose } from '../pose';
import { readPoseDocument } from '../readPose';

const POSES = catalogue();

describe('the pose catalogue under packages/cli/poses', () => {
  it('has poses (an emptied catalogue would pass every case below by covering nothing)', () => {
    expect(POSES.length).toBeGreaterThan(0);
  });

  it('every catalog pose renders and its rendered bytes are committed beside it', async () => {
    // ONE CASE OVER THE WHOLE CATALOGUE, not one per pose. The name IS the rule, and a rule
    // spelled out once with the poses that break it named in the failure reads better than a
    // hundred near-identical case names - and it is the name the plan sign-off promised.
    const diverged: string[] = [];

    for (const { name, posePath, screenPath } of POSES) {
      const rendered = await renderPose(posePath);

      if (process.env.MINT_POSES === '1') {
        fs.writeFileSync(screenPath, rendered);
        continue;
      }

      if (!fs.existsSync(screenPath)) {
        diverged.push(`${name} - no committed screen`);
        continue;
      }

      const committed = fs.readFileSync(screenPath, 'utf8');
      if (rendered === committed) continue;

      diverged.push(`${name} - ${describeFirstDivergence(rendered, committed)}`);
    }

    expect(
      diverged,
      'THE TOOL NO LONGER PRINTS WHAT THESE SCREENS COMMITTED. A committed screen is the ' +
        "tool's own output for that pose, reviewed into git by a person; a divergence means the " +
        'screen a real user reads has changed - its wording, its colour, its blank lines, its ' +
        'box or its exit code. That is a product change to argue for, not a file to re-record: ' +
        "if the new screen is intended, re-mint it in the same PR (see this file's header) and " +
        'say so.'
    ).toEqual([]);
  });

  it('renders the same bytes twice', async () => {
    // Determinism, not truth - a producer agrees with itself by construction. What this catches
    // is a clock, a counter, a temporary path or an environment read leaking onto a screen,
    // which would make the catalogue unmintable rather than wrong.
    const first = await renderPose(POSES[0].posePath);
    const second = await renderPose(POSES[0].posePath);

    expect(first).toBe(second);
  });

  it('CONTROL: a corrupted render is REJECTED (the comparison still rejects what it should)', async () => {
    // One byte. Without this case a comparison that had degenerated into `expect(x).toBe(x)`
    // would look exactly as green as a real proof.
    const rendered = await renderPose(POSES[0].posePath);

    expect(`${rendered} `).not.toBe(fs.readFileSync(POSES[0].screenPath, 'utf8'));
  });

  it('the committed screens KEEP colour, so the comparison above is NOT blind to chalk boundaries', () => {
    // The load-bearing property of this catalogue, asserted rather than assumed. If a screen were
    // ever re-minted through a stripping masker, every case above would keep passing while going
    // blind to every colour and style-boundary change - and nothing else would say so.
    //
    // THE COLOURLESS SCREENS ARE `--metadata` AND `--json`, AND BOTH ARE COLOURLESS ON PURPOSE:
    // each flag prints a JSON contract and nothing else - no header, no colour, no url line -
    // because each is meant to be piped and parsed (commands/view/printBuildView; commands/capture
    // writes the record straight to process.stdout). Reading that exception off the POSE rather
    // than off a list of names is what keeps this case exact: a stripping masker would turn every
    // OTHER screen colourless too, and this would say so.
    // eslint-disable-next-line no-control-regex
    const ansi = /\x1b\[[0-9;]*m/g;

    const colourlessByMistake = POSES.filter(({ posePath, screenPath }) => {
      if (!fs.existsSync(screenPath)) return false;
      if (printsTheJsonContract(posePath)) return false;

      return (fs.readFileSync(screenPath, 'utf8').match(ansi) ?? []).length === 0;
    }).map(({ name }) => name);

    expect(
      colourlessByMistake,
      'a committed screen carries no ANSI - this catalogue is supposed to preserve it, and a ' +
        'stripped screen would make the byte ratchet blind to the chalk class'
    ).toEqual([]);
  });

  it('no pose scripts an answer to a call its command never makes', async () => {
    // The mirror of the refusal rule. A pose that scripts a call the run never reaches is
    // describing a different road from the one its screen shows, and its screen would go on
    // looking perfectly reasonable - so it is caught here rather than read past.
    const withLeftovers: string[] = [];

    for (const { name, posePath } of POSES) {
      const { unusedCalls } = await runPose(readPoseDocument(fs.readFileSync(posePath, 'utf8')));

      if (unusedCalls.length > 0) {
        withLeftovers.push(`${name} - ${unusedCalls.map(({ call }) => call).join(', ')}`);
      }
    }

    expect(withLeftovers).toEqual([]);
  });

  it('no screen carries a path from the machine that rendered it', () => {
    // The two folds the tool always makes (`<PROJECT_ROOT>`, `<SHERLO_CONFIG_PATH>`) exist so a
    // committed screen is the same on every machine. A temporary directory reaching one would
    // make the catalogue red for whoever ran it next, for a reason that is nobody's change.
    const leaking = POSES.filter(
      ({ screenPath }) =>
        fs.existsSync(screenPath) &&
        /sherlo-pose-[A-Za-z0-9]+/.test(fs.readFileSync(screenPath, 'utf8'))
    ).map(({ name }) => name);

    expect(leaking, 'a committed screen names the temporary folder it was rendered in').toEqual([]);
  });
});

/* ========================================================================== */

/** `--metadata` and `--json` print a JSON contract instead of the human view, and that carries no colour. */
function printsTheJsonContract(posePath: string): boolean {
  const { argv } = readPoseDocument(fs.readFileSync(posePath, 'utf8'));
  return argv.includes('--metadata') || argv.includes('--json');
}

/**
 * The first line the two screens disagree on, said so a reader can act on it without opening a
 * diff tool. Escapes are shown, because a moved style boundary is exactly the kind of change
 * this catalogue exists to catch and it is invisible otherwise.
 */
function describeFirstDivergence(rendered: string, committed: string): string {
  const renderedLines = rendered.split('\n');
  const committedLines = committed.split('\n');

  for (let line = 0; line < Math.max(renderedLines.length, committedLines.length); line += 1) {
    if (renderedLines[line] === committedLines[line]) continue;

    return (
      `line ${line + 1}: committed ${JSON.stringify(committedLines[line] ?? null)}, ` +
      `now ${JSON.stringify(renderedLines[line] ?? null)}`
    );
  }

  return 'the screens differ in a way a line-by-line read cannot see';
}
