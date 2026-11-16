/**
 * THE COPY OF THE APP ENTRY AND A BABEL ALIAS (metro/launchTimeEntry.js, metro/appEntryCopy.js): in a
 * release bundle the app side is a copy of the app entry in Sherlo's cache folder. Babel transforms
 * the copy where it lies, so an import it rewrote from a path alias points from the copy's folder,
 * while an import written relatively in the source points from the app entry's folder. Both resolve.
 */
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createProject,
  removeCreatedProjects,
  resolveFrom,
  type ResolveRequest,
} from './launchTimeEntryFixtures';

const { applyLaunchTimeEntry } = require('../../metro/launchTimeEntry');
const { appEntryCopyPath } = require('../../metro/appEntryCopy');

afterEach(removeCreatedProjects);

/**
 * A project whose entry imports through an alias and relatively, with the launch entry's resolver
 * on it, and a way to ask that resolver from the app entry's copy.
 */
function aliasedApp() {
  const root = createProject({
    'package.json': JSON.stringify({ name: 'fixture-app' }),
    'index.js': "import '#/platform/polyfills';\nimport './src/App';\n",
    'src/platform/polyfills.js': 'export {};\n',
    'src/App.js': 'export {};\n',
    '.rnstorybook/index.js': 'export default {};\n',
  });
  const config = applyLaunchTimeEntry(
    { projectRoot: root, resolver: {} },
    path.join(root, '.rnstorybook/index.js'),
    'app-and-storybook'
  );
  const resolveRequest: ResolveRequest = config.resolver.resolveRequest;
  const appEntryCopy: string = appEntryCopyPath(root, path.join(root, 'index.js'));
  function askFromTheCopy(moduleName: string) {
    return resolveFrom(resolveRequest, appEntryCopy, moduleName);
  }
  return { root, appEntryCopy, askFromTheCopy };
}

describe('the copy of the app entry', () => {
  it('the copy of the app entry resolves an import that Babel rewrote from an alias', () => {
    const app = aliasedApp();
    // What babel-plugin-module-resolver makes of '#/platform/polyfills' in the copy's folder.
    const rewritten = path.relative(
      path.dirname(app.appEntryCopy),
      path.join(app.root, 'src/platform/polyfills')
    );

    expect(app.askFromTheCopy(rewritten)).toEqual({
      type: 'sourceFile',
      filePath: path.join(app.root, 'src/platform/polyfills.js'),
    });
  });

  it('the copy of the app entry still resolves a plain relative import as the app entry does', () => {
    const app = aliasedApp();

    expect(app.askFromTheCopy('./src/App')).toEqual({
      type: 'sourceFile',
      filePath: path.join(app.root, 'src/App.js'),
    });
  });

  it("an import of the copy that resolves from neither folder fails with the error from the app entry's folder", () => {
    const app = aliasedApp();

    expect(() => app.askFromTheCopy('./src/Missing')).toThrow(
      `Unable to resolve "./src/Missing" from "${path.join(app.root, 'index.js')}"`
    );
  });
});
