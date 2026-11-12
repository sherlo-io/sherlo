/** metro/bundleBuildFailure.js - the bundler's build error, caught from Metro's reporter and read for the line. */
import { describe, expect, it, vi } from 'vitest';

const { readBuildFailure, watchBuildErrors } = require('../../metro/bundleBuildFailure.js');

describe('the build error Metro reports', () => {
  it('a syntax error is read with its file under the project root, its line and column, and its code frame', () => {
    const failure = readBuildFailure(
      {
        name: 'SyntaxError',
        message: '/proj/src/Inbox.tsx: Unexpected token (12:3)\n\n> 12 | <View\n     |   ^',
        lineNumber: 12,
        column: 3,
      },
      '/proj'
    );

    expect(failure).toEqual({
      kind: 'syntax',
      message: 'Unexpected token',
      file: 'src/Inbox.tsx',
      line: 12,
      column: 3,
      frame: ['> 12 | <View', '     |   ^'],
    });
  });

  it('an import Metro cannot resolve is read with the path the import writes', () => {
    const failure = readBuildFailure(
      {
        type: 'UnableToResolveError',
        message:
          'Unable to resolve module scenes/helpers from /proj/src/App.tsx: it could not be found',
        originModulePath: '/proj/src/App.tsx',
      },
      '/proj'
    );

    expect(failure).toMatchObject({
      kind: 'unresolved-import',
      importPath: 'scenes/helpers',
      file: 'src/App.tsx',
    });
  });
});

describe('the reporter Metro hands the config', () => {
  it('every event reaches the reporter it wraps, and the line hears how a build ended', () => {
    const reporter = { update: vi.fn() };
    const line = { failed: vi.fn(), built: vi.fn() };
    const watched = watchBuildErrors(reporter, '/proj', line);

    watched.update({ type: 'bundle_build_started' });
    watched.update({ type: 'bundling_error', error: new Error('boom') });
    watched.update({ type: 'bundle_build_done' });

    expect(reporter.update).toHaveBeenCalledTimes(3);
    expect(line.failed).toHaveBeenCalledWith({ kind: 'other', message: 'boom' });
    expect(line.built).toHaveBeenCalledTimes(1);
  });

  it('a config with no reporter has nothing to wrap', () => {
    expect(watchBuildErrors(undefined, '/proj', { failed() {}, built() {} })).toBeUndefined();
  });
});
