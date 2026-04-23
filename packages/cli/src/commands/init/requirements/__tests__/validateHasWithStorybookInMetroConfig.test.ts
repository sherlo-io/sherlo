import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sherlo-req-test-'));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

vi.mock('../../../../helpers', () => ({
  getCwd: vi.fn(),
  throwError: vi.fn((opts: { message: string }) => {
    throw new Error(opts.message);
  }),
}));

describe('validateHasWithStorybookInMetroConfig', () => {
  it('does not throw when metro.config.js contains withStorybook(', async () => {
    const filePath = path.join(tmpDir, 'metro.config.js');
    await fs.promises.writeFile(
      filePath,
      `const withStorybook = require('@storybook/react-native/metro/withStorybook');
module.exports = withStorybook(config);`,
      'utf-8'
    );

    const { getCwd } = await import('../../../../helpers');
    vi.mocked(getCwd).mockReturnValue(tmpDir);

    const { default: validateHasWithStorybookInMetroConfig } = await import(
      '../validateHasWithStorybookInMetroConfig'
    );

    await expect(validateHasWithStorybookInMetroConfig()).resolves.toBeUndefined();
  });

  it('throws when no metro config file is found', async () => {
    const { getCwd } = await import('../../../../helpers');
    vi.mocked(getCwd).mockReturnValue(tmpDir);

    const { default: validateHasWithStorybookInMetroConfig } = await import(
      '../validateHasWithStorybookInMetroConfig'
    );

    await expect(validateHasWithStorybookInMetroConfig()).rejects.toThrow(
      'Set up Storybook integration in metro.config.js before initializing Sherlo'
    );
  });

  it('throws when metro.config.js exists but has no withStorybook(', async () => {
    const filePath = path.join(tmpDir, 'metro.config.js');
    await fs.promises.writeFile(filePath, `module.exports = getDefaultConfig(__dirname);`, 'utf-8');

    const { getCwd } = await import('../../../../helpers');
    vi.mocked(getCwd).mockReturnValue(tmpDir);

    const { default: validateHasWithStorybookInMetroConfig } = await import(
      '../validateHasWithStorybookInMetroConfig'
    );

    await expect(validateHasWithStorybookInMetroConfig()).rejects.toThrow(
      'Set up Storybook integration in metro.config.js before initializing Sherlo'
    );
  });
});
