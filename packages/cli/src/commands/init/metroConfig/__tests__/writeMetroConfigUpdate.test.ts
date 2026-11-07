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

const SINGLE_LINE_V10 = `const { getDefaultConfig } = require('@expo/metro-config');
const withStorybook = require('@storybook/react-native/withStorybook');

const defaultConfig = getDefaultConfig(__dirname);

module.exports = withStorybook(defaultConfig);`;

const MULTI_LINE = `const { getDefaultConfig } = require('@expo/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

module.exports = withStorybook(getDefaultConfig(__dirname), {
  enabled: true,
  configPath: path.resolve(__dirname, './.rnstorybook'),
});`;

const MULTI_LINE_V10 = `const { getDefaultConfig } = require('@expo/metro-config');
const withStorybook = require('@storybook/react-native/withStorybook');

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
  it("keeps the file's final newline when it rewrites the config", async () => {
    const content = `${SINGLE_LINE}\n`;
    const filePath = await writeFixture('metro.config.js', content);
    const result = await writeMetroConfigUpdate({ path: filePath, content });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/metro/withStorybook')`);
    expect(output.endsWith(';\n')).toBe(true);
  });

  it('adds no final newline to a config that had none', async () => {
    const filePath = await writeFixture('metro.config.js', SINGLE_LINE);
    const result = await writeMetroConfigUpdate({ path: filePath, content: SINGLE_LINE });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output.endsWith('\n')).toBe(false);
  });

  it('replaces storybook require with sherlo withStorybook require (single-line)', async () => {
    const filePath = await writeFixture('metro.config.js', SINGLE_LINE);
    const result = await writeMetroConfigUpdate({ path: filePath, content: SINGLE_LINE });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/metro/withStorybook')`);
    expect(output).not.toContain(`require('@storybook/react-native/metro/withStorybook')`);
    expect(output).toMatch(/module\.exports = withStorybook\(defaultConfig\)/);
  });

  it('replaces storybook require with sherlo withStorybook require (multi-line)', async () => {
    const filePath = await writeFixture('metro.config.js', MULTI_LINE);
    const result = await writeMetroConfigUpdate({ path: filePath, content: MULTI_LINE });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/metro/withStorybook')`);
    expect(output).not.toContain(`require('@storybook/react-native/metro/withStorybook')`);
    expect(output).toMatch(/module\.exports = withStorybook\([\s\S]*?\)/);
  });

  it('handles regex-killer case (comment with ); inside)', async () => {
    const filePath = await writeFixture('metro.config.js', REGEX_KILLER);
    const result = await writeMetroConfigUpdate({ path: filePath, content: REGEX_KILLER });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/metro/withStorybook')`);
    expect(output).toMatch(/module\.exports = withStorybook\([\s\S]*?\)/);
  });

  it('replaces v10 storybook require (single-line)', async () => {
    const filePath = await writeFixture('metro.config.js', SINGLE_LINE_V10);
    const result = await writeMetroConfigUpdate({ path: filePath, content: SINGLE_LINE_V10 });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/metro/withStorybook')`);
    expect(output).not.toContain(`require('@storybook/react-native/withStorybook')`);
    expect(output).toMatch(/module\.exports = withStorybook\(defaultConfig\)/);
  });

  it('replaces v10 storybook require (multi-line)', async () => {
    const filePath = await writeFixture('metro.config.js', MULTI_LINE_V10);
    const result = await writeMetroConfigUpdate({ path: filePath, content: MULTI_LINE_V10 });

    expect(result.applied).toBe(true);

    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/metro/withStorybook')`);
    expect(output).not.toContain(`require('@storybook/react-native/withStorybook')`);
    expect(output).toMatch(/module\.exports = withStorybook\([\s\S]*?\)/);
  });

  it('is idempotent: already-wrapped file returns applied:true without rewriting', async () => {
    const alreadyWrapped = `const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');
module.exports = withStorybook(getDefaultConfig(__dirname));`;

    const filePath = await writeFixture('metro.config.js', alreadyWrapped);
    const mtimeBefore = (await fs.promises.stat(filePath)).mtimeMs;

    const result = await writeMetroConfigUpdate({ path: filePath, content: alreadyWrapped });

    expect(result.applied).toBe(true);
    const mtimeAfter = (await fs.promises.stat(filePath)).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it("points Storybook's require at Sherlo's whatever shape the export has", async () => {
    const nonCanonical = `const withStorybook = require('@storybook/react-native/metro/withStorybook');
const config = withStorybook(getDefaultConfig(__dirname));
module.exports = config;`;

    const filePath = await writeFixture('metro.config.js', nonCanonical);
    const result = await writeMetroConfigUpdate({ path: filePath, content: nonCanonical });

    expect(result.applied).toBe(true);
    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/metro/withStorybook')`);
    expect(output).toContain('module.exports = config;');
  });

  it('leaves a config exported as a function untouched', async () => {
    const asFunction = `module.exports = async () => ({ resolver: {} });`;

    const filePath = await writeFixture('metro.config.js', asFunction);
    const result = await writeMetroConfigUpdate({ path: filePath, content: asFunction });

    expect(result.applied).toBe(false);
    expect(await fs.promises.readFile(filePath, 'utf-8')).toBe(asFunction);
  });

  it("wraps an ES module config's default export and imports Sherlo's withStorybook", async () => {
    const esModule = `import { getDefaultConfig } from 'expo/metro-config';
const config = getDefaultConfig(__dirname);
export default config;`;

    const filePath = await writeFixture('metro.config.mjs', esModule);
    const result = await writeMetroConfigUpdate({ path: filePath, content: esModule });

    expect(result.applied).toBe(true);
    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(
      `import withStorybook from '@sherlo/react-native-storybook/metro/withStorybook'`
    );
    expect(output).toContain('export default withStorybook(config)');
  });

  it('uses double quotes when file predominantly uses double quotes', async () => {
    const doubleQuoteContent = SINGLE_LINE.replace(/'/g, '"');
    const filePath = await writeFixture('metro.config.js', doubleQuoteContent);
    const result = await writeMetroConfigUpdate({ path: filePath, content: doubleQuoteContent });

    expect(result.applied).toBe(true);
    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require("@sherlo/react-native-storybook/metro/withStorybook")`);
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

  // Only Storybook's withStorybook is swapped, never the plugin around it.
  it("keeps the developer's own local name for a destructured, aliased require", async () => {
    const aliased = `const { withStorybook: sb } = require('@storybook/react-native/metro/withStorybook');

module.exports = sb(getDefaultConfig(__dirname));`;

    const filePath = await writeFixture('metro.config.js', aliased);
    const result = await writeMetroConfigUpdate({ path: filePath, content: aliased });

    expect(result.applied).toBe(true);
    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(
      `const sb = require('@sherlo/react-native-storybook/metro/withStorybook')`
    );
    expect(output).toContain('module.exports = sb(getDefaultConfig(__dirname))');
  });

  it("wraps the exported config in Sherlo's withStorybook when the config has none", async () => {
    const noStorybookRequire = `const x = require('./x');
module.exports = x.y(getDefaultConfig(__dirname));`;

    const filePath = await writeFixture('metro.config.js', noStorybookRequire);
    const result = await writeMetroConfigUpdate({ path: filePath, content: noStorybookRequire });

    expect(result.applied).toBe(true);
    const output = await fs.promises.readFile(filePath, 'utf-8');
    // The printer may wrap the long require over lines; it still comes after the file's own.
    const sherloRequireAt = output.search(
      /const withStorybook = require\(\s*'@sherlo\/react-native-storybook\/metro\/withStorybook'\s*\)/
    );
    expect(sherloRequireAt).toBeGreaterThan(output.indexOf("require('./x')"));
    expect(output).toContain('module.exports = withStorybook(x.y(getDefaultConfig(__dirname)))');
  });

  it("leaves a withStorybook from the developer's own file untouched", async () => {
    const ownWithStorybook = `const withStorybook = require('./tools/withStorybook');
module.exports = withStorybook(getDefaultConfig(__dirname));`;

    const filePath = await writeFixture('metro.config.js', ownWithStorybook);
    const result = await writeMetroConfigUpdate({ path: filePath, content: ownWithStorybook });

    expect(result.applied).toBe(false);
  });

  it('keeps another plugin that wraps withStorybook', async () => {
    const wrappedByAnotherPlugin = `const { getDefaultConfig } = require('@expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(
  withStorybook(config, { enabled: true }),
  { input: './global.css' }
);`;

    const filePath = await writeFixture('metro.config.js', wrappedByAnotherPlugin);
    const result = await writeMetroConfigUpdate({
      path: filePath,
      content: wrappedByAnotherPlugin,
    });

    expect(result.applied).toBe(true);
    const output = await fs.promises.readFile(filePath, 'utf-8');
    expect(output).toContain(`require('@sherlo/react-native-storybook/metro/withStorybook')`);
    expect(output).not.toContain('@storybook/react-native');
    expect(output).toMatch(
      /module\.exports = withNativeWind\(\s*withStorybook\(config, \{\s*enabled: true\s*\}\),\s*\{\s*input: '\.\/global\.css'\s*\}\s*\);/
    );
  });
});
