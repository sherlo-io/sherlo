import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../helpers', () => ({
  getCwd: vi.fn(),
  throwError: vi.fn((options: { message?: string; error?: Error }) => {
    throw options.error ?? new Error(options.message);
  }),
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sherlo-req-test-'));
  const { getCwd } = await import('../../../../helpers');
  vi.mocked(getCwd).mockReturnValue(tmpDir);
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

describe('an installed package version is read', () => {
  it('a package installed under an alias is read by its folder and its version found', async () => {
    const folder = path.join(tmpDir, 'node_modules', 'react-native');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'package.json'),
      JSON.stringify({ name: 'react-native-tvos', version: '0.76.0-0' })
    );
    const { default: getPackageVersion } = await import('../getPackageVersion');

    expect(getPackageVersion('react-native')).toBe('0.76.0-0');
  });
});
