/**
 * SHARD 3 OF THE POSE CATALOGUE LAW (see ./support/catalogueShards.ts and ./catalogue.test.ts).
 * Under `MINT_POSES=1` catalogue.test.ts mints every pose, so this shard stands aside.
 */
import { describe, expect, it, vi } from 'vitest';
import { catalogue } from '../catalogue';
import {
  DIVERGED_MESSAGE,
  posesDivergingFromCommitted,
  posesOfShard,
  posesWithLeftoverCalls,
  shardTitle,
} from './support/catalogueShards';

const SHARD = 3;

vi.mock('../pose', async (importOriginal) =>
  (await import('./support/keptRuns')).posesRunOnce(
    await importOriginal<typeof import('../pose')>()
  )
);

const MINTING = process.env.MINT_POSES === '1';
const MINE = posesOfShard(catalogue(), SHARD);

describe('the pose catalogue under packages/cli/poses, shard 3', () => {
  it.skipIf(MINTING)(shardTitle(SHARD), async () => {
    expect(await posesDivergingFromCommitted(MINE), DIVERGED_MESSAGE).toEqual([]);
  });

  it.skipIf(MINTING)('no pose of this shard scripts a call its command never makes', async () => {
    expect(await posesWithLeftoverCalls(MINE)).toEqual([]);
  });
});
