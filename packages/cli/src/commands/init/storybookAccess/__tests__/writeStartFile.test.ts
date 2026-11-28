/**
 * The setup step that makes Storybook's start file open the app outside Storybook mode
 * (../writeStartFile), read and judged by the SDK's own rules, so the rewritten file is checked
 * with them too.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import writeStartFile from '../writeStartFile';

const {
  detectStorybookSetup,
} = require('../../../../../../react-native-storybook/metro/detectStorybookSetup');

const DEFAULT_SETUP_START_FILE = [
  "import { registerRootComponent } from 'expo';",
  "import { view } from './storybook.requires';",
  '',
  'const StorybookUIRoot = view.getStorybookUI({});',
  '',
  'registerRootComponent(StorybookUIRoot);',
  '',
].join('\n');

let root: string;

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

describe('setup writes the app start file', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-start-file-'));
    write('package.json', JSON.stringify({ name: 'acme-app', main: 'index.ts' }));
    write('index.ts', "import { registerRootComponent } from 'expo';\n");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('the start file registers Storybook only in Storybook mode and loads the app otherwise, through registerRootComponent', () => {
    write('.rnstorybook/index.tsx', DEFAULT_SETUP_START_FILE);

    expect(writeStartFile(root, '.rnstorybook')).toEqual({
      written: path.join(root, '.rnstorybook/index.tsx'),
    });

    const written = read('.rnstorybook/index.tsx');
    expect(written).toBe(
      [
        "import { isStorybookMode } from '@sherlo/react-native-storybook';",
        "import { registerRootComponent } from 'expo';",
        "import { view } from './storybook.requires';",
        '',
        'const StorybookUIRoot = view.getStorybookUI({});',
        '',
        '// Storybook in Storybook mode; the app otherwise, as a scene launch needs it.',
        'if (isStorybookMode) {',
        '  registerRootComponent(StorybookUIRoot);',
        '} else {',
        "  require('../index');",
        '}',
        '',
      ].join('\n')
    );
    // Still Storybook's default setup to the SDK, so its launch entry keeps loading this file.
    expect(detectStorybookSetup(written)).toBe('default');

    // An app whose entry is a package's is loaded by that package's name.
    write('.rnstorybook/index.tsx', DEFAULT_SETUP_START_FILE);
    write('package.json', JSON.stringify({ name: 'acme-app', main: 'expo-router/entry' }));
    writeStartFile(root, '.rnstorybook');
    expect(read('.rnstorybook/index.tsx')).toContain("require('expo-router/entry');");
  });

  it('an app whose entry already branches on Storybook mode is left as it is', () => {
    const branching = [
      "import { registerRootComponent } from 'expo';",
      "import { isStorybookMode } from '@sherlo/react-native-storybook';",
      "import { view } from './storybook.requires';",
      '',
      'if (isStorybookMode) {',
      '  registerRootComponent(view.getStorybookUI({}));',
      '} else {',
      "  require('../index');",
      '}',
      '',
    ].join('\n');
    write('.rnstorybook/index.tsx', branching);

    expect(writeStartFile(root, '.rnstorybook')).toEqual({
      already: path.join(root, '.rnstorybook/index.tsx'),
    });
    expect(read('.rnstorybook/index.tsx')).toBe(branching);
  });

  it('a start file that registers nothing yet is left, answering the app entry its registration requires', () => {
    // The old setup only exports Storybook for the app's own root to render.
    const oldSetup =
      "import { view } from './storybook.requires';\n\nexport default view.getStorybookUI({});\n";
    write('.rnstorybook/index.tsx', oldSetup);

    expect(writeStartFile(root, '.rnstorybook')).toEqual({
      unregistered: path.join(root, '.rnstorybook/index.tsx'),
      appRequest: '../index',
    });
    expect(read('.rnstorybook/index.tsx')).toBe(oldSetup);
  });

  it('a start file registering a root twice is left, with the reason', () => {
    const twice = `${DEFAULT_SETUP_START_FILE}registerRootComponent(StorybookUIRoot);\n`;
    write('.rnstorybook/index.tsx', twice);

    expect(writeStartFile(root, '.rnstorybook')).toEqual({ left: 'not-one-registration' });
    expect(read('.rnstorybook/index.tsx')).toBe(twice);
  });

  it('a Storybook folder with no start file gets none, answering the app entry the file to create requires', () => {
    write('.rnstorybook/main.ts', 'export default { stories: [] };\n');

    expect(writeStartFile(root, '.rnstorybook')).toEqual({
      missing: path.join(root, '.rnstorybook/index.ts'),
      appRequest: '../index',
    });
    expect(fs.readdirSync(path.join(root, '.rnstorybook'))).toEqual(['main.ts']);
  });

  it('the start file is found in the folder setup names, not only in the default ones', () => {
    write('storybook/index.tsx', DEFAULT_SETUP_START_FILE);

    expect(writeStartFile(root, 'storybook')).toEqual({
      written: path.join(root, 'storybook/index.tsx'),
    });
  });
});
