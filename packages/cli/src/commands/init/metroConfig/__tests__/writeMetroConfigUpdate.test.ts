import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import writeMetroConfigUpdate from '../writeMetroConfigUpdate';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sherlo-metro-test-'));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

async function writeFixture(name: string, content: string): Promise<string> {
  const p = path.join(tmpDir, name);
  await fs.promises.writeFile(p, content, 'utf-8');
  return p;
}

const SINGLE_LINE = `const { getDefaultConfig } = require('@expo/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

const defaultConfig = getDefaultConfig(__dirname);

module.exports = withStorybook(defaultConfig);`;

const MULTI_LINE = `const { getDefaultConfig } = require('@expo/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

module.exports = withStorybook(getDefaultConfig(__dirname), {
  enabled: true,
  configPath: path.resolve(__dirname, './.rnstorybook'),
});`;

const REGEX_KILLER = `const { getDefaultConfig } = require('@expo/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

module.exports = withStorybook(getDefaultConfig(__dirname), {
  /* TODO: fix enabled ); */
  enabled: true,
});`;

describe('writeMetroConfigUpdate', () => {
  it('replaces storybook require with sherlo withStorybook require (single-line)', async () => {
    const filePath = await writeFixture('metro.config.js', SINGLE_LINE);
    const result = await writeMetroConfigUpdate({ path: filePath, content: SINGLE_LINE });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/withStorybook')`);
    expect(output).not.toContain(`require('@storybook/react-native/metro/withStorybook')`);
    expect(output).toMatch(/module\.exports = withStorybook\(defaultConfig\)/);
  });

  it('replaces storybook require with sherlo withStorybook require (multi-line)', async () => {
    const filePath = await writeFixture('metro.config.js', MULTI_LINE);
    const result = await writeMetroConfigUpdate({ path: filePath, content: MULTI_LINE });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/withStorybook')`);
    expect(output).not.toContain(`require('@storybook/react-native/metro/withStorybook')`);
    expect(output).toMatch(/module\.exports = withStorybook\([\s\S]*?\)/);
  });

  it('handles regex-killer case (comment with ); inside)', async () => {
    const filePath = await writeFixture('metro.config.js', REGEX_KILLER);
    const result = await writeMetroConfigUpdate({ path: filePath, content: REGEX_KILLER });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/withStorybook')`);
    expect(output).toMatch(/module\.exports = withStorybook\([\s\S]*?\)/);
  });

  it('is idempotent: already-wrapped file returns applied:true without rewriting', async () => {
    const alreadyWrapped = `const withStorybook = require('@sherlo/react-native-storybook/withStorybook');
module.exports = withStorybook(getDefaultConfig(__dirname));`;

    const filePath = await writeFixture('metro.config.js', alreadyWrapped);
    const mtimeBefore = (await fs.promises.stat(filePath)).mtimeMs;

    const result = await writeMetroConfigUpdate({ path: filePath, content: alreadyWrapped });

    expect(result.applied).toBe(true);
    const mtimeAfter = (await fs.promises.stat(filePath)).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it('returns applied:false when module.exports is not a call expression', async () => {
    const nonCanonical = `const withStorybook = require('@storybook/react-native/metro/withStorybook');
const config = withStorybook(getDefaultConfig(__dirname));
module.exports = config;`;

    const filePath = await writeFixture('metro.config.js', nonCanonical);
    const result = await writeMetroConfigUpdate({ path: filePath, content: nonCanonical });

    expect(result.applied).toBe(false);
    expect(await fs.promises.readFile(filePath, 'utf-8')).toBe(nonCanonical);
  });

  it('uses double quotes when file predominantly uses double quotes', async () => {
    const doubleQuoteContent = SINGLE_LINE.replace(/'/g, '"');
    const filePath = await writeFixture('metro.config.js', doubleQuoteContent);
    const result = await writeMetroConfigUpdate({ path: filePath, content: doubleQuoteContent });

    expect(result.applied).toBe(true);
    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require("@sherlo/react-native-storybook/withStorybook")`);
  });

  it('handles TypeScript metro config gracefully (wraps or returns applied:false)', async () => {
    const tsContent = `import { getDefaultConfig } from 'expo/metro-config';
import withStorybook from '@storybook/react-native/metro/withStorybook';
const config = getDefaultConfig(__dirname);
module.exports = withStorybook(config);`;

    const filePath = await writeFixture('metro.config.ts', tsContent);
    const result = await writeMetroConfigUpdate({ path: filePath, content: tsContent });

    expect(typeof result.applied).toBe('boolean');
  });
});
