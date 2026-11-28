/**
 * The build upload's tries (../uploadBuild): what a failure prints, and how long it waits.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import uploadBuild, { type BinaryUploadEffects } from '../uploadBuild';

vi.mock('../../../../commands/shared/terminal', () => ({
  whileShowing: (_step: unknown, run: () => Promise<unknown>) => run(),
}));
vi.mock('../../../transcriptSink', () => ({ emit: vi.fn() }));
vi.mock('../../../reporting', () => ({ default: { addBreadcrumb: vi.fn() } }));
vi.mock('../../../throwError', () => ({
  default: ({ error }: { error: Error }) => {
    throw error;
  },
}));

const SIGNED_LINK = 'https://bucket.example/build.apk?X-Amz-Signature=secret123';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the tries of a build upload', () => {
  it('a failed upload never prints the upload link and waits longer before each new try', async () => {
    const printed = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const waits: number[] = [];
    const effects: BinaryUploadEffects = {
      readBinary: async () => ({ data: Buffer.from('bytes'), sizeMb: '1' }),
      putBinary: async () => {
        throw Object.assign(
          new Error(`request to ${SIGNED_LINK} failed, reason: read ECONNRESET`),
          {
            code: 'ECONNRESET',
          }
        );
      },
      wait: async (ms) => {
        waits.push(ms);
      },
    };

    const upload = uploadBuild({
      buildPath: '/x/build.apk',
      platform: 'android',
      projectRoot: '/x',
      uploadUrl: SIGNED_LINK,
      effects,
    });

    await expect(upload).rejects.toThrow(/Failed to upload .* build after 3 attempts/);
    await expect(upload).rejects.not.toThrow(/secret123/);
    expect(JSON.stringify(printed.mock.calls)).not.toContain('secret123');
    expect(waits).toEqual([5000, 15000]);
  });
});
