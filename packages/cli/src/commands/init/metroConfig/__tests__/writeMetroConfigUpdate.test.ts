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

const CANONICAL_SINGLE_LINE = `const { getDefaultConfig } = require('@expo/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

const defaultConfig = getDefaultConfig(__dirname);

module.exports = withStorybook(defaultConfig);`;

const CANONICAL_MULTI_LINE = `const { getDefaultConfig } = require('@expo/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

module.exports = withStorybook(getDefaultConfig(__dirname), {
  enabled: true,
  configPath: path.resolve(__dirname, './.rnstorybook'),
});`;

describe('writeMetroConfigUpdate', () => {
  it('wraps single-line module.exports correctly (single quotes)', async () => {
    const filePath = await writeFixture('metro.config.js', CANONICAL_SINGLE_LINE);
    const result = await writeMetroConfigUpdate({ path: filePath, content: CANONICAL_SINGLE_LINE, quoteChar: "'" });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`const { withSherlo } = require('@sherlo/react-native-storybook/metro');`);
    expect(output).toContain('module.exports = withSherlo(withStorybook(defaultConfig));');
  });

  it('wraps multi-line module.exports correctly', async () => {
    const filePath = await writeFixture('metro.config.js', CANONICAL_MULTI_LINE);
    const result = await writeMetroConfigUpdate({ path: filePath, content: CANONICAL_MULTI_LINE, quoteChar: "'" });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`const { withSherlo } = require('@sherlo/react-native-storybook/metro');`);
    expect(output).toMatch(/module\.exports = withSherlo\(withStorybook\([\s\S]*?\)\);/);
  });

  it('uses single quotes when quoteChar is single quote', async () => {
    const filePath = await writeFixture('metro.config.js', CANONICAL_SINGLE_LINE);
    const result = await writeMetroConfigUpdate({ path: filePath, content: CANONICAL_SINGLE_LINE, quoteChar: "'" });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/metro')`);
  });

  it('uses double quotes when quoteChar is double quote', async () => {
    const doubleQuote = CANONICAL_SINGLE_LINE
      .replace(/'/g, '"');
    const filePath = await writeFixture('metro.config.js', doubleQuote);
    const result = await writeMetroConfigUpdate({ path: filePath, content: doubleQuote, quoteChar: '"' });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require("@sherlo/react-native-storybook/metro")`);
  });

  it('returns applied:false when module.exports is assigned to a variable (non-canonical)', async () => {
    const nonCanonical = `const withStorybook = require('@storybook/react-native/metro/withStorybook');
const config = withStorybook(getDefaultConfig(__dirname));
module.exports = config;`;

    const filePath = await writeFixture('metro.config.js', nonCanonical);
    const result = await writeMetroConfigUpdate({ path: filePath, content: nonCanonical, quoteChar: "'" });

    expect(result.applied).toBe(false);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toBe(nonCanonical);
  });
});
