'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

// ---------------------------------------------------------------------------
// storybook.requires race guard
// ---------------------------------------------------------------------------
//
// @storybook/react-native's own metro/withStorybook calls its generator and
// RETURNS THE METRO CONFIG WITHOUT WAITING FOR IT. In v10 that generator became
// async (scripts/generate.js awaits loadMainConfig before it ever calls
// fs.writeFileSync), so the requires file is written some time AFTER Metro
// already holds the config. When the file is already on disk that is harmless -
// the rewrite lands before anything resolves it. When the file is ABSENT it is a
// race Metro loses intermittently, and the build dies with:
//
//     Unable to resolve module ./storybook.requires
//
// Absent is the normal state for anyone following Sherlo's guidance to gitignore
// the generated file, so this fails builds on clean checkouts and CI runners.
//
// The guard below closes it at the only place that can: before the config is
// handed back. If the requires file is missing we generate it SYNCHRONOUSLY (in
// a child node process, which cannot return until the write has happened),
// so the file exists before Metro ever crawls. If the file is already there we
// do nothing at all - upstream's own unawaited rewrite still runs, and the
// common committed-file case behaves exactly as it did before.

var REQUIRES_BASENAME = 'storybook.requires';

// Both extensions count as "present": Metro resolves the extensionless
// `./storybook.requires` import against either one, so a project on --use-js is
// no more racy than a project on TypeScript.
var REQUIRES_EXTENSIONS = ['.ts', '.js'];

// Upstream's default config directory, newest first. Only consulted when the
// caller passed no explicit configPath - we pick the one that actually exists on
// disk rather than hardcoding a default, because upstream's own default moved
// from .storybook (v8) to .rnstorybook (v9+) and this wrapper supports both.
var DEFAULT_CONFIG_DIRNAMES = ['.rnstorybook', '.storybook'];

/**
 * Resolves the Storybook config directory the same way upstream does.
 *
 * @param {object} [opts] - the options object passed to withStorybook
 * @returns {string|null} absolute path, or null when no config directory exists
 */
function resolveConfigDir(opts) {
  if (opts && typeof opts.configPath === 'string' && opts.configPath) {
    return path.resolve(process.cwd(), opts.configPath);
  }

  for (var i = 0; i < DEFAULT_CONFIG_DIRNAMES.length; i++) {
    var candidate = path.resolve(process.cwd(), DEFAULT_CONFIG_DIRNAMES[i]);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * @param {string} configDir - absolute path to the Storybook config directory
 * @returns {boolean} whether a storybook.requires file already exists there
 */
function requiresFileExists(configDir) {
  for (var i = 0; i < REQUIRES_EXTENSIONS.length; i++) {
    if (fs.existsSync(path.join(configDir, REQUIRES_BASENAME + REQUIRES_EXTENSIONS[i]))) {
      return true;
    }
  }
  return false;
}

/**
 * Runs @storybook/react-native's OWN generator to completion, in a child node
 * process, so the caller cannot continue until storybook.requires is on disk.
 *
 * A child process is what makes this synchronous for both peer versions at once:
 * v9's generate() is sync and v10's is async, and `execFileSync` returns only
 * once the child has exited - which node does not do until the promise the
 * generator returned has settled and its write has landed.
 *
 * @param {{ configPath: string, useJs: boolean, docTools: boolean }} generateOptions
 */
function runGeneratorSynchronously(generateOptions) {
  // "./scripts/generate" is a public subpath in @storybook/react-native's
  // exports map on every version this package peers with (v8 through v10).
  var generateModulePath = require.resolve('@storybook/react-native/scripts/generate');

  var script =
    'var generateModule = require(' +
    JSON.stringify(generateModulePath) +
    ');' +
    'Promise.resolve(generateModule.generate(' +
    JSON.stringify(generateOptions) +
    ')).then(null, function (error) {' +
    'console.error(error && error.stack ? error.stack : error);' +
    'process.exit(1);' +
    '});';

  childProcess.execFileSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    stdio: 'inherit',
    timeout: 120000,
  });
}

/**
 * Guarantees storybook.requires exists before a Metro config is returned.
 *
 * Does nothing when the file is already present, when Storybook is disabled for
 * this build (upstream never generates in that case, so there is no race), or
 * when the project has no Storybook config directory at all.
 *
 * @param {object} [opts] - the options object passed to withStorybook
 * @param {Function} [runGenerator] - test seam; defaults to the child-process
 *   generator above. Receives the same generateOptions upstream would pass.
 * @returns {boolean} whether the generator was run
 */
function ensureStorybookRequires(opts, runGenerator) {
  if (opts && opts.enabled === false) return false;

  var configDir = resolveConfigDir(opts);
  if (!configDir) return false;
  if (requiresFileExists(configDir)) return false;

  var generateOptions = {
    configPath: configDir,
    useJs: !!(opts && opts.useJs),
    docTools: !(opts && opts.docTools === false),
  };

  try {
    (runGenerator || runGeneratorSynchronously)(generateOptions);
    return true;
  } catch (error) {
    // Never turn a race into a hard failure of its own: upstream's unawaited
    // generate() still runs after we return, so a build that would have worked
    // before still can. Say why, once, so the cause is not invisible.
    console.warn(
      '[Sherlo] Could not pre-generate ' +
        REQUIRES_BASENAME +
        ' in ' +
        configDir +
        '. Metro may fail to resolve ./' +
        REQUIRES_BASENAME +
        ' on this build. Cause: ' +
        (error && error.message ? error.message : error)
    );
    return false;
  }
}

module.exports = ensureStorybookRequires;
module.exports.ensureStorybookRequires = ensureStorybookRequires;
module.exports.resolveConfigDir = resolveConfigDir;
module.exports.requiresFileExists = requiresFileExists;
