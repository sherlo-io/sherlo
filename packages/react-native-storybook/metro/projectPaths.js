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
 * The project's own Babel transformer, as a file Sherlo's transformers can load from its cache
 * folder. Metro's default config names its transformer by package name (metro-babel-transformer),
 * and a name only resolves from where the project or the SDK can load it, so it is resolved here.
 * A name neither can load is kept as it is.
 *
 * @param {object} config - a Metro config
 * @returns {string}
 */
function projectTransformerFile(config) {
  // With no transformer named, Metro uses its own default.
  var named =
    (config.transformer && config.transformer.babelTransformerPath) || 'metro-babel-transformer';
  try {
    return require.resolve(named, { paths: [projectRootOf(config), __dirname] });
  } catch (_) {
    return named;
  }
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
 * Whether a path from the project root leads out of it. A file named `..foo` in the root does not.
 *
 * @param {string} rel - a path from fromProjectRoot
 * @returns {boolean}
 */
function leavesTheRoot(rel) {
  return rel === '..' || rel.indexOf('../') === 0 || path.isAbsolute(rel);
}

/**
 * Whether a bundler path names no file: a synthetic module (Metro's require.context modules hold
 * a "?") or a virtual one (a NUL byte).
 *
 * @param {string} absPath
 * @returns {boolean}
 */
function isVirtualPath(absPath) {
  return !absPath || absPath.indexOf('?') !== -1 || absPath.indexOf('\0') !== -1;
}

/**
 * Converts an absolute Metro module path to a project-root-relative path
 * (e.g. "./src/Button.tsx").  Returns null for:
 *   - synthetic/virtual paths (Metro require.context modules contain "?")
 *   - paths outside the project root
 */
function toRelativePath(absPath, projectRoot) {
  if (isVirtualPath(absPath)) return null;
  var rel = fromProjectRoot(absPath, projectRoot);
  if (leavesTheRoot(rel)) return null;
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
  return './' + rel;
}

/**
 * The key a module has in the module map. A module inside the project has the key toRelativePath
 * gives it. A module outside the project, such as a workspace package, has its path from the
 * project root (e.g. "../packages/ui/x.ts"), the same on every machine that lays the folders out
 * alike. A file in a node_modules folder outside the project has none: it is a dependency, not the
 * app's source.
 *
 * @param {string} absPath - absolute path of a Metro module
 * @param {string} projectRoot - absolute path to the project
 * @returns {string|null} null for a virtual path or a dependency outside the project
 */
function moduleMapKeyOf(absPath, projectRoot) {
  var inside = toRelativePath(absPath, projectRoot);
  if (inside || isVirtualPath(absPath)) return inside;
  var rel = fromProjectRoot(absPath, projectRoot);
  if (path.isAbsolute(rel) || rel.split('/').indexOf('node_modules') !== -1) return null;
  return rel;
}

/**
 * A module's path from the project root with forward slashes, whatever folder it sits in. It names
 * what an import resolves to, so the name is the same under another project root.
 *
 * @param {string} absPath
 * @param {string} projectRoot
 * @returns {string}
 */
function fromProjectRoot(absPath, projectRoot) {
  if (!projectRoot) return absPath;
  return path.relative(projectRoot, absPath).split(path.sep).join('/');
}

module.exports = {
  fromProjectRoot: fromProjectRoot,
  moduleMapKeyOf: moduleMapKeyOf,
  handOverFilePath: handOverFilePath,
  projectRootOf: projectRootOf,
  projectTransformerFile: projectTransformerFile,
  sherloCacheFolder: sherloCacheFolder,
  toRelativePath: toRelativePath,
};
