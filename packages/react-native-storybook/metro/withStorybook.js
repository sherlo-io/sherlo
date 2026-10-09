'use strict';

var fs = require('fs');
var path = require('path');

// A Storybook wrapper module, however it exports its withStorybook.
function storybookWrapperOf(wrapperModule) {
  return wrapperModule.withStorybook || wrapperModule.default || wrapperModule;
}

var realModule;
try {
  realModule = require('@storybook/react-native/metro/withStorybook');
} catch (_) {
  realModule = require('@storybook/react-native/withStorybook');
}
var realWithStorybook = storybookWrapperOf(realModule);
var applySherloTransforms = require('./applySherloTransforms');
var ensureStorybookRequires = require('./ensureStorybookRequires');
var resolveConfigDir = ensureStorybookRequires.resolveConfigDir;
var whatThisBuildCarries = require('./sherloBuild').whatThisBuildCarries;
var detectStorybookSetup = require('./detectStorybookSetup').detectStorybookSetup;
var findStorybookEntry = require('./detectStorybookSetup').findStorybookEntry;
var applyLaunchTimeEntry = require('./launchTimeEntry').applyLaunchTimeEntry;
var projectRootOf = require('./projectPaths').projectRootOf;

var SDK_PACKAGE_NAME = '@sherlo/react-native-storybook';
var STAND_IN_MODULE = '@sherlo/react-native-storybook/dist/offStandIn.js';

/**
 * Whether Metro is bundling for a release build, told while this config loads: Storybook's own
 * wrapper is told whether it is on only here, so the answer cannot wait for the `dev` flag Metro
 * gives the resolver.
 *
 * - Expo's CLI (`expo export:embed`, which EAS builds and `expo run` release builds use, and
 *   `expo export`) sets NODE_ENV to production before it loads the config.
 * - Bare React Native's CLI (`react-native bundle --dev false`, which Gradle and Xcode run for a
 *   release build) sets NODE_ENV only after the config has loaded, so its command line is read:
 *   the config loads in the bundling process itself, whose arguments hold `--dev false`.
 */
function isReleaseBundle() {
  if (process.env.NODE_ENV === 'production') return true;

  var commandLine = process.argv;
  for (var i = 0; i < commandLine.length; i++) {
    if (commandLine[i] === '--dev=false') return true;
    if (commandLine[i] === '--dev' && commandLine[i + 1] === 'false') return true;
  }
  return false;
}

/**
 * The config of a build that carries no Sherlo and no Storybook. Storybook leaves itself out
 * through its own wrapper, turned off; Sherlo adds nothing - no mock shim, no Storybook redirect,
 * no bundler address, no polyfill - but one resolver step. It answers the SDK's package import
 * with the stand-in, so the app's own imports of it still resolve, and answers any module inside
 * the project's Storybook config folder with nothing: Storybook's own off switch empties only its
 * packages, and an old-setup root that imports the folder eagerly would otherwise run it at launch.
 * The import then yields an empty module (its default export undefined), which the root renders
 * only when isStorybookMode, always false in the stand-in.
 */
function withoutSherloOrStorybook(config, opts, storybookWrapper) {
  var configWithoutStorybook = storybookWrapper(
    config,
    Object.assign({}, opts, { enabled: false, onDisabledRemoveStorybook: true })
  );
  var resolveAsTheProjectDoes =
    applySherloTransforms.resolveThroughConfig(configWithoutStorybook);
  var storybookConfigDir = resolveConfigDir(projectRootOf(config), opts);

  function resolveRequest(context, moduleName, platform) {
    if (moduleName === SDK_PACKAGE_NAME) {
      return resolveAsTheProjectDoes(context, STAND_IN_MODULE, platform);
    }
    var resolution = resolveAsTheProjectDoes(context, moduleName, platform);
    var isInsideStorybookConfigDir =
      resolution &&
      resolution.type === 'sourceFile' &&
      applySherloTransforms.isInsideFolder(resolution.filePath, storybookConfigDir);
    return isInsideStorybookConfigDir ? { type: 'empty' } : resolution;
  }

  return Object.assign({}, configWithoutStorybook, {
    resolver: Object.assign({}, configWithoutStorybook.resolver, {
      resolveRequest: resolveRequest,
    }),
  });
}

/**
 * Storybook's newer Metro wrapper, the one at its package root, loaded from the project, where the
 * default setup's Storybook lives.
 */
function loadNewerStorybookWrapper(projectRoot) {
  var newerModule = require('module').createRequire(path.join(projectRoot, 'package.json'))(
    '@storybook/react-native/withStorybook'
  );
  return storybookWrapperOf(newerModule);
}

/**
 * The project's Storybook entry file when the project is on Storybook's default setup, where that
 * file registers itself as the app's root; null on the old setup, or with no entry file at all.
 */
function defaultSetupStorybookEntry(projectRoot, opts) {
  var storybookEntry = findStorybookEntry(projectRoot, opts && opts.configPath);
  if (!storybookEntry) return null;

  var setup = detectStorybookSetup(fs.readFileSync(storybookEntry, 'utf8'));
  return setup === 'default' ? storybookEntry : null;
}

/**
 * Storybook's default setup: Storybook's newer wrapper, with Storybook turned on, then Sherlo's
 * transforms, then the launch entry that picks Storybook or the app at each launch
 * (launchTimeEntry.js).
 */
function withStorybookOnTheDefaultSetup(config, opts, storybookEntry, sherloBuild) {
  var storybookOptions = Object.assign({}, opts, {
    enabled: true,
    configPath: path.dirname(storybookEntry),
  });
  // Must run before Storybook's wrapper returns a config to Metro: see ensureStorybookRequires.js.
  ensureStorybookRequires(storybookOptions);
  var withStorybookOn = loadNewerStorybookWrapper(projectRootOf(config))(config, storybookOptions);
  var withSherlo = applySherloTransforms(withStorybookOn, storybookOptions);
  return applyLaunchTimeEntry(withSherlo, storybookEntry, sherloBuild);
}

/**
 * The one place that decides which road a bundle takes: the build setting, then the project's
 * Storybook setup.
 */
function withStorybook(config, opts) {
  var projectRoot = projectRootOf(config);
  var thisBuild = whatThisBuildCarries(process.env, isReleaseBundle(), opts && opts.enabled);
  var defaultSetupEntry = defaultSetupStorybookEntry(projectRoot, opts);

  if (thisBuild.sherloBuild === 'off') {
    var storybookWrapper = defaultSetupEntry
      ? loadNewerStorybookWrapper(projectRoot)
      : realWithStorybook;
    return withoutSherloOrStorybook(config, opts, storybookWrapper);
  }

  if (defaultSetupEntry) {
    return withStorybookOnTheDefaultSetup(config, opts, defaultSetupEntry, thisBuild.sherloBuild);
  }

  // The old setup.
  var storybookOptions = Object.assign({}, opts, { enabled: thisBuild.storybookEnabled });
  // Must run BEFORE upstream's withStorybook returns a config to Metro - see
  // ensureStorybookRequires.js for the race this closes. No-op when the
  // requires file already exists.
  ensureStorybookRequires(storybookOptions);
  var result = realWithStorybook(config, storybookOptions);
  return applySherloTransforms(result, storybookOptions);
}

module.exports = withStorybook;
module.exports.default = withStorybook;
module.exports.withStorybook = withStorybook;
