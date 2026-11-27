/**
 * THE POSE CATALOGUE LAW.
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
 * (under MINT_POSES this file mints the WHOLE catalogue and the shard files stand aside) and the
 * diff is read like any other diff. A change to which init render words some pose reaches also
 * re-mints the reach witnesses (see ./support/initRenderReach.ts), with:
 *
 *     ALLOW_LOCAL_TEST_EXEC=1 MINT_POSES=1 yarn test src/commands/pose/__tests__/initRenderReach.test.ts
 * Without `MINT_POSES` this file only ever compares -
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
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { catalogue, renderPose } from '../catalogue';
import { readPoseDocument } from '../readPose';
import {
  DIVERGED_MESSAGE,
  SHARD_COUNT,
  posesDivergingFromCommitted,
  posesOfShard,
  posesWithLeftoverCalls,
} from './support/catalogueShards';
import { keepRunsOfPoses } from './support/keptRuns';

// Two cases read the same run of every pose, so a run is kept the first time (see posesRunOnce).
vi.mock('../pose', async (importOriginal) =>
  (await import('./support/keptRuns')).posesRunOnce(
    await importOriginal<typeof import('../pose')>()
  )
);

const POSES = catalogue();
const MINTING = process.env.MINT_POSES === '1';
// Re-minting runs the whole catalogue in this one file (about a quarter of a second a pose), far
// past the five seconds a checked shard gets; it is a local step, never a pull request's check.
const WHOLE_CATALOGUE_TIMEOUT = MINTING ? 600_000 : undefined;

describe('the pose catalogue under packages/cli/poses', () => {
  it('has poses (an emptied catalogue would pass every case below by covering nothing)', () => {
    expect(POSES.length).toBeGreaterThan(0);
  });

  it(
    'every catalog pose renders and its rendered bytes are committed beside it',
    async () => {
      // THIS FILE CHECKS SHARD 1 OF THE CATALOGUE (shards 2 to 32 sit in catalogueShard2.test.ts to
      // catalogueShard32.test.ts, so the poses render in parallel workers), or all of it when
      // re-minting. The next case proves the shards together are the whole catalogue. The name IS
      // the rule, and a rule spelled out once with the poses that break it named in the failure
      // reads better than a hundred near-identical case names.
      const mine = MINTING ? POSES : posesOfShard(POSES, 1);

      expect(await posesDivergingFromCommitted(mine), DIVERGED_MESSAGE).toEqual([]);
    },
    WHOLE_CATALOGUE_TIMEOUT
  );

  it('the shards of the catalogue together are every pose, each in exactly one shard, each with its file', () => {
    const inShards = Array.from({ length: SHARD_COUNT }, (_, index) =>
      posesOfShard(POSES, index + 1)
    ).flat();

    expect(inShards.map(({ name }) => name).sort()).toEqual(POSES.map(({ name }) => name).sort());

    // A shard with no file is a slice of the catalogue nobody checks; a file past the last shard
    // checks nothing. Shard 1 is this file; each catalogueShard<n>.test.ts after it must exist and
    // say it is shard n.
    const shardFiles = fs
      .readdirSync(__dirname)
      .filter((file) => /^catalogueShard\d+\.test\.ts$/.test(file))
      .map((file) => ({
        file,
        declares: /^const SHARD = (\d+);$/m.exec(
          fs.readFileSync(path.join(__dirname, file), 'utf8')
        )?.[1],
      }));
    const expected = Array.from({ length: SHARD_COUNT - 1 }, (_, index) => ({
      file: `catalogueShard${index + 2}.test.ts`,
      declares: String(index + 2),
    }));
    const byFile = (a: { file: string }, b: { file: string }) => a.file.localeCompare(b.file);

    expect(shardFiles.sort(byFile)).toEqual(expected.sort(byFile));
  });

  it('renders the same bytes twice', async () => {
    // Determinism, not truth - a producer agrees with itself by construction. What this catches
    // is a clock, a counter, a temporary path or an environment read leaking onto a screen,
    // which would make the catalogue unmintable rather than wrong.
    keepRunsOfPoses(false);
    let first: string;
    let second: string;
    try {
      first = await renderPose(POSES[0].posePath);
      second = await renderPose(POSES[0].posePath);
    } finally {
      keepRunsOfPoses(true);
    }

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
    // THE COLOURLESS SCREENS ARE `--json`, AND THEY ARE COLOURLESS ON PURPOSE: the flag prints a
    // record and nothing else - no header, no colour, no url line - because it is meant to be
    // piped and parsed (commands/view/printBuildView; commands/capture writes the record straight
    // to process.stdout). `sherlo view --wait --json` is one too: commander's own refusal of the
    // pair, before anything prints. Reading that exception off the POSE rather
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

  it(
    'no pose scripts an answer to a call its command never makes',
    async () => {
      // The mirror of the refusal rule. A pose that scripts a call the run never reaches is
      // describing a different road from the one its screen shows, and its screen would go on
      // looking perfectly reasonable - so it is caught here rather than read past.
      const mine = MINTING ? POSES : posesOfShard(POSES, 1);

      expect(await posesWithLeftoverCalls(mine)).toEqual([]);
    },
    WHOLE_CATALOGUE_TIMEOUT
  );

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

/**
 * `--json` prints a record instead of the human view, and `--help` prints commander's own usage
 * text: neither carries colour.
 */
function printsTheJsonContract(posePath: string): boolean {
  const { argv } = readPoseDocument(fs.readFileSync(posePath, 'utf8'));
  return argv.includes('--json') || argv.includes('--help');
}
