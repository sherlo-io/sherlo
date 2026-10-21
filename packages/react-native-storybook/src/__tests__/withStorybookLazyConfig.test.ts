import * as fs from 'fs';
import * as path from 'path';

import { createFixtureRoot, fixtureFileWriter } from './bundle/fixtureMetroConfig';
import { enterBundlingProcess } from './bundlingProcess';

// The real wrapper, with the real Storybook wrapper behind it (a dev dependency of this package).
const withStorybook = require('../../metro/withStorybook');
const { sherloCacheFolder } = require('../../metro/projectPaths');

const TRANSFORMER_PATH = '/the/project/transformer.js';

// The app's own resolver: it answers every name its own way.
const appResolveRequest = (_context: unknown, name: string) => ({
  type: 'sourceFile',
  filePath: '/the/project/resolved/' + name,
});

// A project on the old Storybook setup: a config folder and no default-setup entry.
function createProject(): string {
  const root = createFixtureRoot('sherlo-lazy-config-');
  fixtureFileWriter(root)(
    '.rnstorybook/main.js',
    "module.exports = { stories: ['../src/**/*.stories.?(ts|tsx|js|jsx)'], addons: [] };\n"
  );
  return root;
}

// Another wrapper (withRozenite, withSentryConfig) may hand over Metro's lazy forms of a config: a
// function that returns it, possibly asynchronously, or a promise of it.
describe('the bundler wrapper over a config another wrapper made lazy', () => {
  let projectRoot: string;
  let leaveBundlingProcess: () => void;

  beforeEach(() => {
    projectRoot = createProject();
    leaveBundlingProcess = enterBundlingProcess({ SHERLO_BUILD: 'app-and-storybook' }, ['start']);
  });

  afterEach(() => {
    leaveBundlingProcess();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  function projectConfig() {
    return {
      projectRoot,
      resolver: { resolveRequest: appResolveRequest },
      transformer: { babelTransformerPath: TRANSFORMER_PATH },
    };
  }

  const LAZY_FORMS = [
    { name: 'an async function', wrap: (config: object) => async () => config },
    { name: 'a plain function', wrap: (config: object) => () => config },
    { name: 'a promise', wrap: (config: object) => Promise.resolve(config) },
  ];

  it("a bundler config given as a function or a promise keeps the app's own transformer and resolver, whichever plugin wraps first", async () => {
    for (const form of LAZY_FORMS) {
      const wrapped = withStorybook(form.wrap(projectConfig()), {
        configPath: path.join(projectRoot, '.rnstorybook'),
      });

      expect(typeof wrapped, form.name).toBe('function');
      const config = await wrapped();

      expect(config.transformer.babelTransformerPath, form.name).toBe(TRANSFORMER_PATH);
      expect(config.transformer.unstable_allowRequireContext, form.name).toBe(true);
      expect(typeof config.server.enhanceMiddleware, form.name).toBe('function');
      expect(
        config.resolver.resolveRequest(
          { originModulePath: path.join(projectRoot, 'index.js') },
          'some-lib',
          'ios'
        ),
        form.name
      ).toEqual({ type: 'sourceFile', filePath: '/the/project/resolved/some-lib' });
      expect(
        config.resolver.resolveRequest(
          { originModulePath: path.join(projectRoot, 'index.js') },
          '@storybook/react-native',
          'ios'
        ),
        form.name
      ).toEqual({
        type: 'sourceFile',
        filePath: path.join(sherloCacheFolder(projectRoot), 'storybook-wrapper.js'),
      });
    }
  });
});
