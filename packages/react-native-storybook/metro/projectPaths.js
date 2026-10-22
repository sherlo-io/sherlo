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

/**
 * Sherlo's hand-over file: what `sherlo test` in EAS mode writes into the project before it starts
 * the EAS builds, and what EAS uploads with the project. The SDK is plain JavaScript and cannot
 * import the CLI, so this repeats the names the CLI keeps in packages/cli/src/constants.ts
 * (SHERLO_TEMP_DIRECTORY and SHERLO_TEMP_DATA_FILENAME): change them together.
 *
 * @param {string} projectRoot - absolute path to the project
 * @returns {string}
 */
function handOverFilePath(projectRoot) {
  return path.join(projectRoot, '.sherlo', 'data.json');
}

/**
 * Converts an absolute Metro module path to a project-root-relative path
 * (e.g. "./src/Button.tsx").  Returns null for:
 *   - synthetic/virtual paths (Metro require.context modules contain "?")
 *   - paths outside the project root
 */
function toRelativePath(absPath, projectRoot) {
  if (!absPath || absPath.indexOf('?') !== -1 || absPath.indexOf('\0') !== -1) {
    return null;
  }
  var rel = path.relative(projectRoot, absPath);
  if (rel.indexOf('..') === 0) return null; // outside project root
  // The leading "./" is INTENTIONAL and load-bearing - do not strip it to match
  // sherlo-api's DiffScope.md "Serialized shape" doc, which shows bare paths
  // (e.g. "src/Button.tsx"). That doc describes the server's canonicalized
  // form, not what the SDK is supposed to emit. This helper's "./"-prefixed
  // output feeds the Diff Scope module manifest (the moduleHashes/storyClosures
  // keys emitted by emitModuleManifestSidecar in applySherloTransforms.js). The server strips the
  // prefix at ingestion, in sherlo-api's parseModuleManifest
  // (computeDiffScopeDecision/moduleManifest.ts), per SHERLO-1912. Emitting bare
  // paths here would mismatch every "./"-keyed ancestor manifest already stored
  // in S3 - making every module look changed and silently degrading partial
  // capture to whole-suite capture for every diff going forward.
  return './' + rel.split(path.sep).join('/');
}

module.exports = {
  handOverFilePath: handOverFilePath,
  projectRootOf: projectRootOf,
  sherloCacheFolder: sherloCacheFolder,
  toRelativePath: toRelativePath,
};
