/**
 * The door every `sherlo capture` ending goes through (../runScene): what it keeps and saves. The
 * whole run of a scene is held by capture.test.ts and the poses under poses/capture.
 */
import { describe, expect, it, vi } from 'vitest';
import { keepTheCapture, savePicture } from '../runScene';

vi.mock('../../../seams/deviceState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../seams/deviceState')>()),
  saveScreenPicture: async () => {
    throw new Error('no screen');
  },
}));

describe('what a capture keeps and saves', () => {
  it('keeps nothing when no folder was made for the capture', async () => {
    expect(await keepTheCapture(undefined, {}, undefined)).toBe(false);
  });

  it('gives a picture that could not be saved its own error and its path', async () => {
    const picture = await savePicture({} as never, './out.png');

    expect(picture).toEqual({ path: './out.png', error: 'no screen' });
  });
});
