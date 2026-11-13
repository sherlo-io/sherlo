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

    expect(writeStartFile(root)).toBe(path.join(root, '.rnstorybook/index.tsx'));

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
    writeStartFile(root);
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

    expect(writeStartFile(root)).toBeNull();
    expect(read('.rnstorybook/index.tsx')).toBe(branching);

    // The old setup only exports Storybook for the app's own root to render: left too.
    const oldSetup =
      "import { view } from './storybook.requires';\n\nexport default view.getStorybookUI({});\n";
    write('.rnstorybook/index.tsx', oldSetup);
    expect(writeStartFile(root)).toBeNull();
    expect(read('.rnstorybook/index.tsx')).toBe(oldSetup);
  });

  it('an app with no Storybook start file gets none', () => {
    expect(writeStartFile(root)).toBeNull();
    expect(fs.existsSync(path.join(root, '.rnstorybook'))).toBe(false);
  });
});
