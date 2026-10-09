'use strict';

var realModule;
try {
  realModule = require('@storybook/react-native/metro/withStorybook');
} catch (_) {
  realModule = require('@storybook/react-native/withStorybook');
}
var realWithStorybook = realModule.withStorybook || realModule.default || realModule;
var applySherloTransforms = require('./applySherloTransforms');
var ensureStorybookRequires = require('./ensureStorybookRequires');
var resolveConfigDir = ensureStorybookRequires.resolveConfigDir;
var whatThisBuildCarries = require('./sherloBuild').whatThisBuildCarries;

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
function withoutSherloOrStorybook(config, opts) {
  var configWithoutStorybook = realWithStorybook(
    config,
    Object.assign({}, opts, { enabled: false, onDisabledRemoveStorybook: true })
  );
  var resolveAsTheProjectDoes =
    applySherloTransforms.resolveThroughConfig(configWithoutStorybook);
  var storybookConfigDir = resolveConfigDir(process.cwd(), opts);

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

function withStorybook(config, opts) {
  var thisBuild = whatThisBuildCarries(process.env, isReleaseBundle(), opts && opts.enabled);
  if (thisBuild.sherloBuild === 'off') {
    return withoutSherloOrStorybook(config, opts);
  }

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
