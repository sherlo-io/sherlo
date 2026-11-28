/**
 * REACH SHARD 2 OF THE INIT RENDER LAYER (see ./support/initRenderReach.ts and ./initRenderReach.test.ts).
 * Under `MINT_POSES=1` initRenderReach.test.ts runs every init pose, so this shard stands aside.
 */
import { describe, expect, it } from 'vitest';
import {
  INIT_RENDER_FILES,
  REACH_MESSAGE,
  reachShardFaults,
  reachShardTitle,
} from './support/initRenderReach';

const SHARD = 2;

describe('the init render layer, reach shard 2', () => {
  it.skipIf(process.env.MINT_POSES === '1')(reachShardTitle(SHARD), async () => {
    const { files, ...faults } = await reachShardFaults(SHARD);

    expect(files).toEqual(INIT_RENDER_FILES);
    expect(faults, REACH_MESSAGE).toEqual({ undrawn: [], drawnNow: [], witnessLost: [] });
  });
});
