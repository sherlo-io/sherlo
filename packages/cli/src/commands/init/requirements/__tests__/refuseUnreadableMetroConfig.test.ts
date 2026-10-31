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

async function check(metroConfig: string | null): Promise<void> {
  if (metroConfig !== null) {
    await fs.promises.writeFile(path.join(tmpDir, 'metro.config.js'), metroConfig, 'utf-8');
  }

  const { getCwd } = await import('../../../../helpers');
  vi.mocked(getCwd).mockReturnValue(tmpDir);

  const { default: refuseUnreadableMetroConfig } = await import('../refuseUnreadableMetroConfig');

  return refuseUnreadableMetroConfig();
}

describe('the project check refuses only a Metro config setup cannot wire', () => {
  it("passes a config with Storybook's withStorybook, which the Metro step points at Sherlo's", async () => {
    await expect(
      check(`const withStorybook = require('@storybook/react-native/metro/withStorybook');
module.exports = withStorybook(config);`)
    ).resolves.toBeUndefined();
  });

  it('passes a project with no Metro config, which the Metro step writes', async () => {
    await expect(check(null)).resolves.toBeUndefined();
  });

  it('passes the factory shape, already wired for Sherlo', async () => {
    await expect(
      check(`const withStorybook = require('@storybook/react-native/metro/withStorybook');
const { createSherloStorybook } = require('@sherlo/react-native-storybook/metro');
const withSherloStorybook = createSherloStorybook(withStorybook);
module.exports = withSherloStorybook(defaultConfig, { enabled: true });`)
    ).resolves.toBeUndefined();
  });

  it('passes a config with no withStorybook, which the Metro step wraps', async () => {
    await expect(check(`module.exports = getDefaultConfig(__dirname);`)).resolves.toBeUndefined();
  });

  it('refuses a config exported as a function, naming the file setup cannot edit', async () => {
    await expect(check(`module.exports = async () => ({ resolver: {} });`)).rejects.toThrow(
      "Setup can't edit metro.config.js"
    );
  });
});
