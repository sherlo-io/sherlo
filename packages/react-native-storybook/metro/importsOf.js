'use strict';

var fromProjectRoot = require('./projectPaths').fromProjectRoot;

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

module.exports = {
  importEdgesOf: importEdgesOf,
  importsOf: importsOf,
};
