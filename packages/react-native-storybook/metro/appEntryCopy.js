'use strict';

// The copy of the app entry a release bundle runs as its app side: the app entry's own file holds
// the launch entry there (launchTimeEntry.js). Where the copy is written, and how its imports
// resolve.

var path = require('path');
var sherloCacheFolder = require('./projectPaths').sherloCacheFolder;

/**
 * Where a release bundle's copy of the app's entry is written: beside the launch entry, in
 * Sherlo's cache folder.
 *
 * @param {string} projectRoot - absolute path to the project
 * @param {string} appEntry - absolute path to the app's entry file
 * @returns {string}
 */
function appEntryCopyPath(projectRoot, appEntry) {
  return path.join(sherloCacheFolder(projectRoot), 'app-entry-original' + path.extname(appEntry));
}

/**
 * `resolve`, with the imports of the copy of the app entry resolved as the app entry's own: an
 * import written relatively in the source points from the app entry's folder. Babel transforms the
 * copy where it lies, though, so an import it rewrote from a path alias points from the copy's own
 * folder: when the app entry's folder finds nothing, the copy's folder is tried. When neither finds
 * it, the error is the one the app entry's folder gave, as Metro wrote it.
 *
 * @param {Function} resolve - a Metro resolveRequest
 * @param {string} appEntry - absolute path to the app's entry file
 * @param {string} appEntryCopy - absolute path to its copy (appEntryCopyPath)
 * @returns {Function} a Metro resolveRequest
 */
function appEntryCopyResolver(resolve, appEntry, appEntryCopy) {
  return function resolveRequest(context, moduleName, platform) {
    if (context.originModulePath !== appEntryCopy) return resolve(context, moduleName, platform);
    var asTheAppEntry = Object.assign({}, context, { originModulePath: appEntry });
    try {
      return resolve(asTheAppEntry, moduleName, platform);
    } catch (fromTheAppEntry) {
      try {
        return resolve(context, moduleName, platform);
      } catch (_) {
        // Neither folder has it: the app entry's error stands.
        throw fromTheAppEntry;
      }
    }
  };
}

module.exports = {
  appEntryCopyPath: appEntryCopyPath,
  appEntryCopyResolver: appEntryCopyResolver,
};
