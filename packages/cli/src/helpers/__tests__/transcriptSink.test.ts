import { describe, expect, it } from 'vitest';
import { captureTranscript, emit, readHoldingSegments } from '../transcriptSink';

describe('reading with the transcript held', () => {
  it('prints what the read emitted only when released, and only once', async () => {
    const hold = {} as Awaited<ReturnType<typeof readHoldingSegments<number>>>;

    const duringRead = await captureTranscript(async () => {
      Object.assign(
        hold,
        await readHoldingSegments(async () => {
          emit({ kind: 'git-history-fetch-refused', reason: 'no credentials' });
          return 7;
        })
      );
    });
    expect(duringRead.stdout + duringRead.stderr).toBe('');
    expect(hold.result).toBe(7);

    const released = await captureTranscript(async () => {
      hold.release();
      hold.release();
    });
    const text = released.stdout + released.stderr;
    expect(text).toContain("Couldn't fetch the git history: no credentials");
    expect(text.match(/Couldn't fetch/g)).toHaveLength(1);
  });
});
