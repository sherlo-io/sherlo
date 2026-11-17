'use strict';

var fromProjectRoot = require('./projectPaths').fromProjectRoot;
var moduleMapKeyOf = require('./projectPaths').moduleMapKeyOf;

/**
 * The imports of one Metro module, in the order the module's code numbers them. A require.context
 * import points at a synthetic module whose path (`?ctx=...`) holds no file, so it is told apart
 * by the specifier the code wrote.
 *
 * @param {object} module - a Metro graph module
 * @returns {{ absolutePath: string, isContext: boolean, specifier: string|undefined }[]}
 */
function importEdgesOf(module) {
  var edges = [];
  if (!module || !(module.dependencies instanceof Map)) return edges;
  module.dependencies.forEach(function (dep) {
    if (!dep.absolutePath) return;
    var contextParams = dep.data && dep.data.data && dep.data.data.contextParams;
    edges.push({
      absolutePath: dep.absolutePath,
      isContext: Boolean(contextParams),
      specifier: dep.data && dep.data.name,
    });
  });
  return edges;
}

/**
 * What each import of a module resolves to, in import order: the resolved file from the project
 * root with forward slashes, or for a require.context import its specifier. The names carry no
 * absolute path, so one graph laid under two project roots gives one list.
 *
 * @param {object} module - a Metro graph module
 * @param {string} projectRoot - absolute path to the project
 * @returns {string[]}
 */
function importsOf(module, projectRoot) {
  return importEdgesOf(module).map(function (edge) {
    if (edge.isContext) return 'context:' + edge.specifier;
    return fromProjectRoot(edge.absolutePath, projectRoot);
  });
}

/**
 * What a module imports, named the way the module map keys its files: each import has the key
 * moduleMapKeyOf gives it, so an import the map holds no file for (a dependency outside the
 * project) is left out. A require.context import keeps its `context:` specifier.
 *
 * @param {object} module - a Metro graph module
 * @param {string} projectRoot - absolute path to the project
 * @returns {string[]}
 */
function importKeysOf(module, projectRoot) {
  var keys = [];
  importEdgesOf(module).forEach(function (edge) {
    if (edge.isContext) {
      keys.push('context:' + edge.specifier);
      return;
    }
    var key = moduleMapKeyOf(edge.absolutePath, projectRoot);
    if (key) keys.push(key);
  });
  return keys;
}

module.exports = {
  importKeysOf: importKeysOf,
  importEdgesOf: importEdgesOf,
  importsOf: importsOf,
};
