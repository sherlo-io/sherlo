import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { detectStorybookSetup, findStorybookEntry } = require('../../metro/detectStorybookSetup');

describe('which Storybook setup a project has', () => {
  it('detects the default setup when the Storybook entry registers a root component', () => {
    const source = `
      import { registerRootComponent } from 'expo';
      import { view } from './storybook.requires';
      const StorybookUIRoot = view.getStorybookUI({});
      registerRootComponent(StorybookUIRoot);
    `;
    expect(detectStorybookSetup(source)).toBe('default');
  });

  it('detects registerRootComponent imported from expo, in TypeScript', () => {
    const source = `
      import { registerRootComponent } from 'expo';
      const Root: React.ComponentType = () => null;
      registerRootComponent(Root as React.ComponentType);
    `;
    expect(detectStorybookSetup(source)).toBe('default');
  });

  it('detects registerRootComponent imported from expo, in JavaScript', () => {
    const source = `
      const { registerRootComponent } = require('expo');
      registerRootComponent(() => null);
    `;
    expect(detectStorybookSetup(source)).toBe('default');
  });

  it('detects AppRegistry.registerComponent from react-native, in TypeScript', () => {
    const source = `
      import { AppRegistry } from 'react-native';
      const name: string = 'main';
      AppRegistry.registerComponent(name, () => StorybookUIRoot);
    `;
    expect(detectStorybookSetup(source)).toBe('default');
  });

  it('detects AppRegistry.registerComponent from react-native, in JavaScript', () => {
    const source = `
      const { AppRegistry } = require('react-native');
      AppRegistry.registerComponent('main', () => StorybookUIRoot);
    `;
    expect(detectStorybookSetup(source)).toBe('default');
  });

  it('detects the old setup when the Storybook entry only exports a component', () => {
    const source = `
      import { view } from './storybook.requires';
      const StorybookUIRoot = view.getStorybookUI({});
      export default StorybookUIRoot;
    `;
    expect(detectStorybookSetup(source)).toBe('old');
  });

  it('a registration inside a comment or a string does not count', () => {
    const source = `
      // registerRootComponent(Root);
      /* AppRegistry.registerComponent('main', () => Root); */
      const note = "registerRootComponent(Root)";
      const other = 'AppRegistry.registerComponent(a, b)';
      const template = \`registerRootComponent(\${note})\`;
      export default function Root() { return null; }
    `;
    expect(detectStorybookSetup(source)).toBe('old');
  });
});

describe('finding the Storybook entry file', () => {
  function inProject(files: string[], run: (projectRoot: string) => void): void {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-setup-test-'));
    try {
      files.forEach((file) => {
        fs.mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, file), '');
      });
      run(projectRoot);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }

  it('finds the index of the default config folder', () => {
    inProject(['.rnstorybook/index.tsx'], (projectRoot) => {
      expect(findStorybookEntry(projectRoot)).toBe(
        path.join(projectRoot, '.rnstorybook/index.tsx')
      );
    });
  });

  it('finds the index of a config folder the project names', () => {
    inProject(['custom/index.js'], (projectRoot) => {
      expect(findStorybookEntry(projectRoot, 'custom')).toBe(
        path.join(projectRoot, 'custom/index.js')
      );
    });
  });

  it('returns null when there is no entry file', () => {
    inProject(['.rnstorybook/main.ts'], (projectRoot) => {
      expect(findStorybookEntry(projectRoot)).toBeNull();
    });
  });
});
