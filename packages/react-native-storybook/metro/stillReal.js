'use strict';

// The bundler's half of "watch every app module while a capture runs".
//
// The bundler knows which modules are the app's own (a file inside the project, not in
// node_modules, not Sherlo's own, not a story or Storybook's config). The run-time half (the
// polyfill) is what wraps a module's exports in a recording stand-in - and only when the
// JavaScript starts in a capture's testing mode. Here the bundler hands it the list: one script
// before the bundle's modules,
//   __sherloStillRealPaths = { "<module id>": "src/..." , ... }
// with each path relative to the project root, with no leading "./".
//
// The list is the one sign of a capture, for both halves. A capture reaches only an app whose
// JavaScript the developer's bundler served, so only a bundle this bundler serves carries it; a
// bundle built for a device (a push's, a release build's, the one a cloud test run starts) has
// none. The polyfill watches only in testing mode with the list (polyfill.js `isCapture`), and the
// SDK reads the same answer (src/mocking/stillReal.ts `isACapture`).

var path = require('path');
var toRelativePath = require('./projectPaths').toRelativePath;
var SOURCE_EXTENSIONS = require('./sourceFiles').SOURCE_EXTENSIONS;
var packageNameOf = require('./mockShims').packageNameOf;

var NOT_THE_APPS =
  /(^|\/)(node_modules|\.sherlo|\.rnstorybook|\.storybook|sherlo-lib)(\/|$)|\.stories\.[a-z]+$|storybook\.requires\.[a-z]+$/;

/**
 * The app's own modules in `graphModules`, as { moduleId: "path/from/project/root" }.
 * @param {Map<string, any>} graphModules - Metro's graph.dependencies
 * @param {(absPath: string) => number|string} createModuleId
 * @param {string} projectRoot
 */
function appModulePathsOf(graphModules, createModuleId, projectRoot) {
  var paths = {};
  graphModules.forEach(function (module, absPath) {
    // Metro numbers modules in the order it first asks; ask for every one, in the graph's order.
    var moduleId = createModuleId(absPath);
    var withDot = toRelativePath(absPath, projectRoot);
    if (!withDot) return;
    var rel = withDot.slice(2);
    if (NOT_THE_APPS.test(rel)) return;
    if (SOURCE_EXTENSIONS.indexOf(path.extname(rel)) === -1) return;
    paths[moduleId] = rel;
  });
  return paths;
}

/**
 * The libraries that hold a private copy of what each declared mock names, as
 * { mockKey: [library] }: a module under node_modules/<library>/node_modules/<package of the key>.
 * A mock of the app's copy never reaches it, and the SDK names the library when such a mock misses
 * (src/mocking/stillReal.ts privateCopiesHandedByBundler), reading by the mock key as written.
 * @param {Map<string, any>} graphModules - Metro's graph.dependencies
 * @param {string[]} mockedModuleKeys - the keys the project's mocks are declared under
 */
function privateCopiesOf(graphModules, mockedModuleKeys) {
  var byPackage = privateCopiesByPackage(graphModules);
  var owners = {};
  (mockedModuleKeys || []).forEach(function (key) {
    var found = byPackage[packageNameOf(key)];
    if (found) owners[key] = found;
  });
  return owners;
}

function privateCopiesByPackage(graphModules) {
  var owners = {};
  graphModules.forEach(function (module, absPath) {
    var names = absPath
      .split('/node_modules/')
      .slice(1)
      .map(packageNameOf);
    if (names.length < 2) return;
    var owner = names[names.length - 2];
    var copy = names[names.length - 1];
    owners[copy] = owners[copy] || [];
    if (owners[copy].indexOf(owner) === -1) owners[copy].push(owner);
  });
  return owners;
}

/** A Metro pre-module (a script that runs before the modules) that sets the lists. */
function listPreModule(paths, privateCopies) {
  var code =
    'globalThis.__sherloStillRealPaths = ' +
    JSON.stringify(paths) +
    ';';
  if (privateCopies && Object.keys(privateCopies).length > 0) {
    code += 'globalThis.__sherloPrivateCopies = ' + JSON.stringify(privateCopies) + ';';
  }
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
function withStillRealList(delegateSerializer, projectRoot, mockedModuleKeys) {
  return function stillRealSerializer(entryPoint, preModules, graph, options) {
    var modules = preModules;
    try {
      if (graph && graph.dependencies instanceof Map) {
        var paths = appModulePathsOf(
          graph.dependencies,
          options.createModuleId,
          (options && options.projectRoot) || projectRoot
        );
        modules = preModules.concat([listPreModule(paths, privateCopiesOf(graph.dependencies, mockedModuleKeys)),
        ]);
      }
    } catch (_) {
      // Never throw into a user's bundle: no list means nothing is watched.
    }
    return delegateSerializer(entryPoint, modules, graph, options);
  };
}

/**
 * The list, for the bundles this bundler serves to an app and no other. A request through the
 * bundler's middleware (`bundlerServes`) is how this process learns it serves one: a process that
 * only builds a bundle for a device answers no request, so what it serializes carries no list.
 */
function listForServedBundles(projectRoot, mockedModuleKeys) {
  var serves = false;
  return {
    bundlerServes: function () {
      serves = true;
    },
    wrap: function (delegateSerializer) {
      var withList = withStillRealList(delegateSerializer, projectRoot, mockedModuleKeys);
      return function servedBundleSerializer(entryPoint, preModules, graph, options) {
        return (serves ? withList : delegateSerializer)(entryPoint, preModules, graph, options);
      };
    },
  };
}

module.exports = {
  appModulePathsOf: appModulePathsOf,
  listForServedBundles: listForServedBundles,
  privateCopiesOf: privateCopiesOf,
  listPreModule: listPreModule,
  withStillRealList: withStillRealList,
};
