import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../helpers', () => ({
  getCwd: vi.fn(),
  throwError: vi.fn((options: { message?: string; error?: Error }) => {
    throw options.error ?? new Error(options.message);
  }),
  getErrorWithCustomMessage: vi.fn((error: Error) => error),
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

describe('package files are found in the project', () => {
  it("a renamed package's package.json is found by folder, not by its name field", async () => {
    const folder = path.join(tmpDir, 'node_modules', 'storybook-alias');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'package.json'),
      JSON.stringify({ name: '@storybook/react-native', version: '9.0.0' })
    );
    const { findInstalledPackageJsonPath } = await import('../findPackageJsonPaths');

    expect(findInstalledPackageJsonPath('storybook-alias')).toBe(path.join(folder, 'package.json'));
    expect(findInstalledPackageJsonPath('@storybook/react-native')).toBeNull();
  });
});
