/**
 * THE SURROUNDINGS SEAM - what a pose's `git` answers must fail the way a real repository fails.
 *
 * A pose exists so a planned screen can be rendered by the SHIPPED tool without standing up the
 * world. That only holds while the posed failure reads exactly like the real one - a pose that
 * invents its own wording is a second implementation of the product, not a stand-in for it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { readGitInfoFromDisk } from '../../helpers/getGitInfo';
import { captureTranscript } from '../../helpers/transcriptSink';
import { posedSurroundings } from '../surroundings';

describe('a posed absent repository degrades with the message a real failed rev-parse gives', () => {
  it('prints the same warning a real folder with no repository above it prints', async () => {
    // A folder under the OS temp root, guaranteed to sit outside any git working tree - the same
    // condition `readGitInfoFromDisk` hits when its `git rev-parse HEAD` fails.
    const noRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-no-git-'));

    try {
      const real = await captureTranscript(async () => {
        await readGitInfoFromDisk(noRepo);
      });

      const posed = await captureTranscript(async () => {
        await posedSurroundings({ env: {}, git: 'none' }).readGitInfo(noRepo);
      });

      expect(posed.stderr).toBe(real.stderr);
    } finally {
      fs.rmSync(noRepo, { recursive: true, force: true });
    }
  });
});
