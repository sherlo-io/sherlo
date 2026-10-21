'use strict';

// SPIKE still-real-on-hermes. The bundler's half of "watch every app module while a capture runs".
//
// The bundler knows which modules are the app's own (a file inside the project, not in
// node_modules, not Sherlo's own, not a story or Storybook's config). The run-time half (the
// polyfill) is what wraps a module's exports in a recording stand-in - and only in testing mode.
// Here the bundler hands it the list: one script before the bundle's modules,
//   __sherloStillRealPaths = { "<module id>": "./src/..." , ... }
// A build with SHERLO_STILL_REAL=off carries no list, so nothing is watched (the unwatched run).

var path = require('path');

var NOT_THE_APPS =
  /(^|\/)(node_modules|\.sherlo|\.rnstorybook|\.storybook|sherlo-lib)(\/|$)|\.stories\.[a-z]+$|storybook\.requires\.[a-z]+$/;

/** Whether this build should carry the list at all. */
function isWatchingOn(env) {
  return env.SHERLO_STILL_REAL !== 'off';
}

/**
 * The app's own modules in `graph`, as { moduleId: "./path/from/project/root" }.
 * @param {Map<string, any>} graphModules - Metro's graph.dependencies
 * @param {(absPath: string) => number|string} createModuleId
 * @param {string} projectRoot
 */
function appModulePathsOf(graphModules, createModuleId, projectRoot) {
  var paths = {};
  graphModules.forEach(function (module, absPath) {
    // Metro numbers modules in the order it first asks; ask for every one, in the graph's order.
    var moduleId = createModuleId(absPath);
    if (!absPath || absPath.indexOf('?') !== -1 || absPath.indexOf('\0') !== -1) return;
    var rel = path.relative(projectRoot, absPath);
    if (rel.indexOf('..') === 0 || path.isAbsolute(rel)) return;
    rel = rel.split(path.sep).join('/');
    if (NOT_THE_APPS.test(rel)) return;
    if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(rel)) return;
    paths[moduleId] = './' + rel;
  });
  return paths;
}

/** A Metro pre-module (a script that runs before the modules) that sets the list. */
function listPreModule(paths) {
  var code = 'globalThis.__sherloStillRealPaths = ' + JSON.stringify(paths) + ';';
  return {
    path: '\0sherlo-still-real-paths',
    dependencies: new Map(),
    inverseDependencies: new Set(),
    getSource: function () {
      return Buffer.from(code);
    },
    output: [
      {
        type: 'js/script/virtual',
        data: { code: code, lineCount: 1, map: [] },
      },
    ],
  };
}

/**
 * Wrap a serializer so its bundle carries the list.
 * @returns {Function} a serializer
 */
function withStillRealList(delegateSerializer, projectRoot, env) {
  return function stillRealSerializer(entryPoint, preModules, graph, options) {
    var modules = preModules;
    try {
      if (isWatchingOn(env || process.env) && graph && graph.dependencies instanceof Map) {
        var paths = appModulePathsOf(
          graph.dependencies,
          options.createModuleId,
          (options && options.projectRoot) || projectRoot
        );
        modules = preModules.concat([listPreModule(paths)]);
      }
    } catch (_) {
      // Never throw into a user's bundle: no list means nothing is watched.
    }
    return delegateSerializer(entryPoint, modules, graph, options);
  };
}

module.exports = {
  isWatchingOn: isWatchingOn,
  appModulePathsOf: appModulePathsOf,
  listPreModule: listPreModule,
  withStillRealList: withStillRealList,
};
