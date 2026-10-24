/**
 * THE CATALOGUE LAW, CUT INTO SHARDS. Running a pose is real work (116 of them take a few seconds
 * of CPU together) and a test file is held to five seconds of its own work, so the catalogue is
 * checked by several test files at once: `catalogue.test.ts` holds shard 1 and the other cases,
 * `catalogueShard2.test.ts` to `catalogueShard4.test.ts` hold the rest. A pose belongs to the
 * shard its place in the sorted catalogue gives it; `catalogue.test.ts` checks that the shards
 * together are the whole catalogue.
 */
import fs from 'fs';
import type { CataloguedPose } from '../../catalogue';
import { renderPose } from '../../catalogue';
import { runPose } from '../../pose';
import { readPoseDocument } from '../../readPose';

export const SHARD_COUNT = 4;

/** The title every shard's committed-bytes case begins with: the one the book pages cite. */
export const COMMITTED_BYTES_TITLE =
  'every catalog pose renders and its rendered bytes are committed beside it';

/** The poses shard `shard` (1 to SHARD_COUNT) checks: every SHARD_COUNT-th pose of the catalogue. */
export function posesOfShard(poses: CataloguedPose[], shard: number): CataloguedPose[] {
  return poses.filter((_, place) => place % SHARD_COUNT === shard - 1);
}

/** The title of shard `shard`'s case: the cited title, then which shard it is. */
export function shardTitle(shard: number): string {
  return `${COMMITTED_BYTES_TITLE} (shard ${shard} of ${SHARD_COUNT})`;
}

/**
 * The poses of `poses` whose rendered bytes are not the committed ones, each with where. Under
 * `MINT_POSES=1` it writes the bytes instead and reports nothing.
 */
export async function posesDivergingFromCommitted(poses: CataloguedPose[]): Promise<string[]> {
  const diverged: string[] = [];

  for (const { name, posePath, screenPath } of poses) {
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

  return diverged;
}

/** What a failing committed-bytes case says. */
export const DIVERGED_MESSAGE =
  'THE TOOL NO LONGER PRINTS WHAT THESE SCREENS COMMITTED. A committed screen is the ' +
  "tool's own output for that pose, reviewed into git by a person; a divergence means the " +
  'screen a real user reads has changed - its wording, its colour, its blank lines, its ' +
  'box or its exit code. That is a product change to argue for, not a file to re-record: ' +
  "if the new screen is intended, re-mint it in the same PR (see catalogue.test.ts's header) " +
  'and say so.';

/** The poses of `poses` that script an answer to a call their command never makes, with which. */
export async function posesWithLeftoverCalls(poses: CataloguedPose[]): Promise<string[]> {
  const withLeftovers: string[] = [];

  for (const { name, posePath } of poses) {
    const { unusedCalls } = await runPose(readPoseDocument(fs.readFileSync(posePath, 'utf8')));

    if (unusedCalls.length > 0) {
      withLeftovers.push(`${name} - ${unusedCalls.map(({ call }) => call).join(', ')}`);
    }
  }

  return withLeftovers;
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
