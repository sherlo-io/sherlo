import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import accessFileInDirectory from '../accessFileInDirectory';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-access-file-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('accessFileInDirectory - operation: read', () => {
  it('returns file content when the file exists', async () => {
    fs.writeFileSync(path.join(tmpDir, 'sherlo.json'), '{"version":"1.2.3"}');

    const content = await accessFileInDirectory({
      operation: 'read',
      directory: tmpDir,
      file: 'sherlo.json',
    });

    expect(content).toBe('{"version":"1.2.3"}');
  });

  it('returns undefined when the file does not exist (ENOENT)', async () => {
    const content = await accessFileInDirectory({
      operation: 'read',
      directory: tmpDir,
      file: 'sherlo.json',
    });

    expect(content).toBeUndefined();
  });

  it('throws for non-ENOENT errors (e.g. EISDIR)', async () => {
    // A directory where a file is expected triggers EISDIR, not ENOENT
    fs.mkdirSync(path.join(tmpDir, 'sherlo.json'));

    await expect(
      accessFileInDirectory({ operation: 'read', directory: tmpDir, file: 'sherlo.json' })
    ).rejects.toThrow(/EISDIR/);
  });
});

describe('accessFileInDirectory - operation: exists', () => {
  it('returns true when the file exists', async () => {
    fs.writeFileSync(path.join(tmpDir, 'sherlo.json'), '{}');

    const exists = await accessFileInDirectory({
      operation: 'exists',
      directory: tmpDir,
      file: 'sherlo.json',
    });

    expect(exists).toBe(true);
  });

  it('returns false when the file does not exist', async () => {
    const exists = await accessFileInDirectory({
      operation: 'exists',
      directory: tmpDir,
      file: 'sherlo.json',
    });

    expect(exists).toBe(false);
  });
});
