import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureTranscript } from '../../../../transcriptSink';
import getBuildData from '../getBuildData';

describe('getBuildData', () => {
  const temporaryFolders: string[] = [];

  afterEach(() => {
    for (const folder of temporaryFolders.splice(0)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('packing an iOS app build for upload prints nothing', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'get-build-data-'));
    temporaryFolders.push(folder);
    const tarPath = path.join(folder, 'Shop.tar');
    fs.writeFileSync(tarPath, 'not really a tar, only bytes to compress');

    let buildData: Buffer | undefined;
    const transcript = await captureTranscript(async () => {
      buildData = await getBuildData({ buildPath: tarPath, platform: 'ios', projectRoot: folder });
    });

    expect(buildData?.length).toBeGreaterThan(0);
    expect(transcript).toEqual({ stdout: '', stderr: '' });
  });
});
