/**
 * EVERY PIECE OF SETUP'S MESSAGE CODE IS DRAWN BY SOME POSE (see ./support/initRenderReach.ts).
 *
 * This file checks reach shard 1 (shards 2 to REACH_SHARD_COUNT sit in initRenderReachShard<n>.test.ts,
 * so the poses run in parallel workers), and the witness file the shards share. Under
 * `MINT_POSES=1` it runs every init pose instead and writes the witness file afresh.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  INIT_RENDER_FILES,
  LISTED,
  REACH_MESSAGE,
  REACH_SHARD_COUNT,
  WITNESSES_PATH,
  initPoses,
  joinReaches,
  measureReach,
  messagesOf,
  reachShardFaults,
  reachShardTitle,
  readWitnesses,
  witnessesFrom,
} from './support/initRenderReach';

const SHARD = 1;
const MINTING = process.env.MINT_POSES === '1';

describe('the init render layer, reach shard 1', () => {
  it.skipIf(MINTING)(reachShardTitle(SHARD), async () => {
    const { files, ...faults } = await reachShardFaults(SHARD);

    // A render file no pose loaded would pass with nothing measured: each one must have been seen.
    expect(files).toEqual(INIT_RENDER_FILES);
    expect(faults, REACH_MESSAGE).toEqual({ undrawn: [], drawnNow: [], witnessLost: [] });
  });

  it.runIf(MINTING)(
    'mints the witness file from a run of every init pose',
    async () => {
      const { reaches, files } = await measureReach(initPoses, { eachPose: true });
      const witnesses = witnessesFrom(reaches);
      fs.writeFileSync(WITNESSES_PATH, `${JSON.stringify(witnesses, null, 2)}\n`);

      const { seen, reached } = messagesOf(joinReaches(reaches.map(({ reach }) => reach)));
      expect(files).toEqual(INIT_RENDER_FILES);
      expect({
        undrawn: seen.filter((message) => !reached.has(message) && !(message in LISTED)),
        drawnNow: Object.keys(LISTED).filter((message) => reached.has(message)),
      }).toEqual({ undrawn: [], drawnNow: [] });
    },
    600_000
  );

  it('the witness file names init poses only, and no listed message', async () => {
    const { catalogue } = await import('../catalogue');
    const names = new Set(initPoses(catalogue()).map(({ name }) => name));
    const witnesses = readWitnesses();

    expect(Object.values(witnesses).filter((pose) => !names.has(pose))).toEqual([]);
    expect(Object.keys(witnesses).filter((message) => message in LISTED)).toEqual([]);
  });

  it('each reach shard has its file', () => {
    // A shard with no file is a slice of the init poses nobody runs; a file past the last shard
    // runs nothing. Shard 1 is this file; each initRenderReachShard<n>.test.ts after it must exist
    // and say it is shard n.
    const shardFiles = fs
      .readdirSync(__dirname)
      .filter((file) => /^initRenderReachShard\d+\.test\.ts$/.test(file))
      .map((file) => ({
        file,
        declares: /^const SHARD = (\d+);$/m.exec(
          fs.readFileSync(path.join(__dirname, file), 'utf8')
        )?.[1],
      }))
      .sort((a, b) => a.file.localeCompare(b.file));
    const expected = Array.from({ length: REACH_SHARD_COUNT - 1 }, (_, index) => ({
      file: `initRenderReachShard${index + 2}.test.ts`,
      declares: String(index + 2),
    })).sort((a, b) => a.file.localeCompare(b.file));

    expect(shardFiles).toEqual(expected);
  });
});
