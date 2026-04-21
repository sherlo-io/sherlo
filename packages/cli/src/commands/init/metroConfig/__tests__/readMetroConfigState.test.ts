import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sherlo-metro-state-'));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

vi.mock('../../../../helpers', () => ({
  getCwd: vi.fn(),
}));

async function setupTest(filename: string, content: string) {
  const filePath = path.join(tmpDir, filename);
  await fs.promises.writeFile(filePath, content, 'utf-8');

  const { getCwd } = await import('../../../../helpers');
  vi.mocked(getCwd).mockReturnValue(tmpDir);

  return filePath;
}

describe('readMetroConfigState', () => {
  it('detects alreadyWrapped when withSherlo( is present', async () => {
    await setupTest(
      'metro.config.js',
      `const withStorybook = require('@storybook/react-native/metro/withStorybook');
module.exports = withSherlo(withStorybook(config));`
    );

    const { default: readMetroConfigState } = await import('../readMetroConfigState');
    const state = await readMetroConfigState();

    expect(state.alreadyWrapped).toBe(true);
    expect(state.hasWithStorybook).toBe(true);
    expect(state.path).not.toBeNull();
  });

  it('detects hasWithStorybook when withStorybook( is present but not wrapped', async () => {
    await setupTest(
      'metro.config.js',
      `const withStorybook = require('@storybook/react-native/metro/withStorybook');
module.exports = withStorybook(config);`
    );

    const { default: readMetroConfigState } = await import('../readMetroConfigState');
    const state = await readMetroConfigState();

    expect(state.alreadyWrapped).toBe(false);
    expect(state.hasWithStorybook).toBe(true);
  });

  it('returns path:null when no metro config file found', async () => {
    const { getCwd } = await import('../../../../helpers');
    vi.mocked(getCwd).mockReturnValue(tmpDir);

    const { default: readMetroConfigState } = await import('../readMetroConfigState');
    const state = await readMetroConfigState();

    expect(state.path).toBeNull();
    expect(state.content).toBeNull();
    expect(state.alreadyWrapped).toBe(false);
    expect(state.hasWithStorybook).toBe(false);
  });

  it('detects single quoteChar', async () => {
    await setupTest(
      'metro.config.js',
      `const withStorybook = require('@storybook/react-native/metro/withStorybook');
module.exports = withStorybook(config);`
    );

    const { default: readMetroConfigState } = await import('../readMetroConfigState');
    const state = await readMetroConfigState();

    expect(state.quoteChar).toBe("'");
  });

  it('detects double quoteChar', async () => {
    await setupTest(
      'metro.config.js',
      `const withStorybook = require("@storybook/react-native/metro/withStorybook");
module.exports = withStorybook(config);`
    );

    const { default: readMetroConfigState } = await import('../readMetroConfigState');
    const state = await readMetroConfigState();

    expect(state.quoteChar).toBe('"');
  });
});
