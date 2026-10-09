'use strict';

var path = require('path');

/**
 * The project a Metro config bundles: the config's own projectRoot, or the folder the bundler was
 * started in when the config names none.
 *
 * @param {object} [config] - a Metro config
 * @returns {string} absolute path to the project
 */
function projectRootOf(config) {
  return (config && config.projectRoot) || process.cwd();
}

/**
 * The folder Sherlo writes its generated files into, inside the project's node_modules cache.
 *
 * @param {string} projectRoot - absolute path to the project
 * @returns {string}
 */
function sherloCacheFolder(projectRoot) {
  return path.join(projectRoot, 'node_modules', '.cache', 'sherlo');
}

module.exports = {
  projectRootOf: projectRootOf,
  sherloCacheFolder: sherloCacheFolder,
};
