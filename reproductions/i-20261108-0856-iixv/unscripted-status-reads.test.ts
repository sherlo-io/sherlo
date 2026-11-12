import { describe, expect, it } from 'vitest';
import { runPose } from '../pose';

describe('reproduction: a posed wait the pose stops answering burns hundreds of refused reads', () => {
  it('ends after at most 150 unscripted status reads, not about 1001', async () => {
    const { refusals } = await runPose({
      pose: 1,
      argv: ['view', '7', '--wait'],
      files: { 'sherlo.config.json': { devices: [{ id: 'pixel.7', osVersion: '13' }] } },
      env: { SHERLO_TOKEN: 'posetokenposetokenposetokenpose1tm0000017' },
      git: 'none',
      bundles: {},
      api: [
        { call: 'getBuildStatus', with: { buildIndex: 7 }, answer: { runStatus: 'inProgress' } },
      ],
      masks: {},
    });

    const unscriptedReads = refusals.filter(({ call }) => call === 'getBuildStatus').length;
    expect(unscriptedReads).toBeGreaterThan(0);
    expect(unscriptedReads).toBeLessThanOrEqual(150);
  });
});
