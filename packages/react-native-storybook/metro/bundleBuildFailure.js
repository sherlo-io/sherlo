'use strict';

/**
 * THE BUNDLE THAT DOES NOT BUILD - what the bundler says when it cannot build the app's code,
 * caught and handed to the line (./sherloLine) so a waiting `sherlo capture` is answered, instead of
 * waiting for a scene that will never come.
 *
 * Metro reports its build errors to its reporter, the one object a Metro config owns for events.
 * `watchBuildErrors` wraps that reporter: every event goes on to it untouched, and the two that say
 * how a build ended are told to the line - an error as `failed(failure)`, a finished build as
 * `built()`. The failure is read from the error as Metro gives it (an unresolved import, a syntax
 * error from the transform, anything else) into the shape the CLI reads (cli seams/bundleFailure):
 * its kind, the bundler's message without its code frame, the file under the project root, the
 * line and column, and the code frame's lines.
 */
var path = require('path');

/** The code frame in a Metro error message sits after the first blank line, with its caret marks. */
var CODE_FRAME_SEPARATOR = '\n\n';

/**
 * The failure a Metro build error comes to, in the words the CLI reads.
 *
 * @param {object} error the error Metro reported (`bundling_error`'s `error`)
 * @param {string} projectRoot
 */
function readBuildFailure(error, projectRoot) {
  var text = String((error && error.message) || error || '');
  var parts = text.split(CODE_FRAME_SEPARATOR);
  var firstPart = parts[0];

  var unresolved = /Unable to resolve module (\S+)/.exec(firstPart);
  var isUnresolved =
    unresolved !== null || (error && /UnableToResolve/.test(String(error.type || error.name)));
  var isSyntax =
    !isUnresolved && !!error && (error.name === 'SyntaxError' || /SyntaxError/.test(firstPart));

  var file = (error && (error.filename || error.originModulePath)) || fileOfMessage(firstPart);
  var location = (error && error.loc) || {};
  var line =
    numberOf(error && error.lineNumber) || numberOf(location.line) || lineOfMessage(firstPart);
  var column = numberOf(error && error.column) || numberOf(location.column);

  var frameText =
    (error && error.codeFrame && error.codeFrame.content) || parts.slice(1).join('\n');
  var frame = frameText
    ? String(frameText)
        .split('\n')
        .filter(function (frameLine) {
          return frameLine.trim() !== '';
        })
    : [];

  var importPath = unresolved !== null ? unresolved[1].replace(/^['"`]|['"`]$/g, '') : undefined;
  var failure = {
    kind: isUnresolved ? 'unresolved-import' : isSyntax ? 'syntax' : 'other',
    message: firstPart.replace(/^[^\s:]+\.\w+:\s*/, '').replace(/\s*\(\d+:\d+\)\s*$/, ''),
  };
  if (file) failure.file = relativeTo(projectRoot, file);
  if (line) failure.line = line;
  if (column) failure.column = column;
  if (frame.length > 0) failure.frame = frame;
  if (importPath) failure.importPath = importPath;
  return failure;
}

/**
 * Wrap a Metro reporter so the line hears how each build ended. The wrapped reporter is returned;
 * with no reporter to wrap there is nothing to listen to, and nothing is returned.
 *
 * @param {{ update: Function } | undefined} reporter
 * @param {string} projectRoot
 * @param {{ failed: (failure: object) => void, built: () => void }} line
 */
function watchBuildErrors(reporter, projectRoot, line) {
  if (!reporter || typeof reporter.update !== 'function') return undefined;
  return {
    update: function (event) {
      reporter.update(event);
      if (!event) return;
      if (event.type === 'bundling_error') line.failed(readBuildFailure(event.error, projectRoot));
      if (event.type === 'bundle_build_done') line.built();
    },
  };
}

function numberOf(value) {
  return typeof value === 'number' && isFinite(value) ? value : undefined;
}

/** The file a transform error's message starts with: "/abs/src/App.tsx: Unexpected token (12:3)". */
function fileOfMessage(message) {
  var found = /^(\S+\.\w+):\s/.exec(message);
  return found === null ? undefined : found[1];
}

/** The line a transform error's message ends with: "(12:3)". */
function lineOfMessage(message) {
  var found = /\((\d+):\d+\)\s*$/.exec(message);
  return found === null ? undefined : Number(found[1]);
}

function relativeTo(projectRoot, file) {
  if (!path.isAbsolute(file)) return file;
  var relative = path.relative(projectRoot, file);
  return relative.startsWith('..') ? file : relative;
}

module.exports = {
  readBuildFailure: readBuildFailure,
  watchBuildErrors: watchBuildErrors,
};
