'use strict';

var fs = require('fs');
var path = require('path');

var applySherloTransforms = require('./applySherloTransforms');
var ensureStorybookRequires = require('./ensureStorybookRequires');
var resolveConfigDir = ensureStorybookRequires.resolveConfigDir;
var whatThisBuildCarries = require('./sherloBuild').whatThisBuildCarries;
var detectStorybookSetup = require('./detectStorybookSetup').detectStorybookSetup;
var findStorybookEntry = require('./detectStorybookSetup').findStorybookEntry;
var applyLaunchTimeEntry = require('./launchTimeEntry').applyLaunchTimeEntry;
var findSceneFiles = require('./sceneFiles').findSceneFiles;
var writeBundledScenesModule = require('./sceneFiles').writeBundledScenesModule;
var projectRootOf = require('./projectPaths').projectRootOf;
var sherloCacheFolder = require('./projectPaths').sherloCacheFolder;
var resolvesToFile = require('./mockShims').resolvesToFile;

var SDK_PACKAGE_NAME = '@sherlo/react-native-storybook';
var STAND_IN_MODULE = '@sherlo/react-native-storybook/dist/offStandIn.js';

// Storybook's two Metro wrappers: the older one in its metro folder, on the versions that have it,
// and the newer one at its package root.
var OLDER_STORYBOOK_WRAPPER = '@storybook/react-native/metro/withStorybook';
var NEWER_STORYBOOK_WRAPPER = '@storybook/react-native/withStorybook';

// A Storybook wrapper module, however it exports its withStorybook.
function storybookWrapperOf(wrapperModule) {
  return wrapperModule.withStorybook || wrapperModule.default || wrapperModule;
}

/**
 * Storybook's Metro wrapper: the first of `wrapperModuleNames` that loads, as `requiringFile`
 * would require it.
 *
 * Loaded through createRequire, not a literal require: the published build is bundled, and only a
 * require made at run time resolves from the folder asked for.
 *
 * @param {string} requiringFile - absolute path of the file the wrapper is required from
 * @param {string[]} wrapperModuleNames - the wrappers to try, in order
 * @returns {Function}
 */
function loadStorybookWrapper(requiringFile, wrapperModuleNames) {
  var requireFromThere = require('module').createRequire(requiringFile);
  for (var i = 0; i < wrapperModuleNames.length; i++) {
    var isLastName = i === wrapperModuleNames.length - 1;
    try {
      return storybookWrapperOf(requireFromThere(wrapperModuleNames[i]));
    } catch (error) {
      if (isLastName) throw error;
    }
  }
}

/**
 * The wrapper Storybook's old setup takes: the older one when this version has it, else the newer,
 * loaded from the SDK's own folder.
 */
function loadOldSetupStorybookWrapper() {
  return loadStorybookWrapper(__filename, [OLDER_STORYBOOK_WRAPPER, NEWER_STORYBOOK_WRAPPER]);
}

/**
 * Storybook's newer wrapper, loaded from the project, where the default setup's Storybook lives.
 */
function loadNewerStorybookWrapper(projectRoot) {
  return loadStorybookWrapper(path.join(projectRoot, 'package.json'), [NEWER_STORYBOOK_WRAPPER]);
}

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
  var resolveAsTheProjectDoes = applySherloTransforms.resolveThroughConfig(configWithoutStorybook);
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
  var projectRoot = projectRootOf(config);
  var storybookOptions = Object.assign({}, opts, {
    enabled: true,
    configPath: path.dirname(storybookEntry),
  });
  // Must run before Storybook's wrapper returns a config to Metro: see ensureStorybookRequires.js.
  ensureStorybookRequires(projectRoot, storybookOptions);
  var withStorybookOn = loadNewerStorybookWrapper(projectRoot)(config, storybookOptions);
  var withSherlo = applySherloTransforms(withStorybookOn, storybookOptions);
  return withSceneBoot(applyLaunchTimeEntry(withSherlo, storybookEntry, sherloBuild));
}

/**
 * Whether the project keeps its scenes in files of their own and has no Storybook at all: no
 * Storybook config folder, and at least one scene file.
 */
function hasSceneFilesAndNoStorybook(projectRoot, opts) {
  return resolveConfigDir(projectRoot, opts) === null && findSceneFiles(projectRoot).length > 0;
}

/**
 * The road of an app with scene files and no Storybook: Sherlo's transforms, then a launch entry
 * with only the app's side. No Storybook wrapper is loaded and no setup file is written.
 */
function withScenesOnly(config, opts, sherloBuild) {
  if (sherloBuild === 'off') return config;
  return withSceneBoot(
    applyLaunchTimeEntry(applySherloTransforms(config, opts), null, sherloBuild)
  );
}

/**
 * The SDK's file at `relativePath` inside its package, as the project loads the SDK, symlinks
 * followed: the path Metro files the module under. Null when the project cannot load the SDK.
 */
function sdkFileOfProject(projectRoot, relativePath) {
  try {
    var requireFromProject = require('module').createRequire(
      path.join(projectRoot, 'package.json')
    );
    var sdkFolder = path.dirname(requireFromProject.resolve(SDK_PACKAGE_NAME + '/package.json'));
    return fs.realpathSync(path.join(sdkFolder, relativePath));
  } catch (_) {
    return null;
  }
}

/**
 * The launched scene's mocks on before the app's first module (src/sceneBoot.ts), on a config
 * that carries Sherlo. Two steps, both only for a project with scene files:
 *
 * - Metro runs the SDK's early-boot module before the bundle's main module, after the modules the
 *   config already runs there: React Native's own start-up installs the globals (fetch,
 *   XMLHttpRequest, WebSocket) the network mocks wrap, so it must run first. Metro runs a listed
 *   module only when it is in the bundle; the SDK's entry imports it.
 * - The early-boot module's import of the SDK's empty list of scenes (src/bundledScenes.ts) is
 *   answered with the project's own list, written now (sceneFiles.js, writeBundledScenesModule).
 *
 * The record is as old as the bundler, as the module manifest's scene ids are: a scene added since
 * needs a restart of the bundler.
 */
function withSceneBoot(config) {
  var projectRoot = projectRootOf(config);
  var sceneBootModule = sdkFileOfProject(projectRoot, 'dist/sceneBoot.js');
  var emptySceneList = sdkFileOfProject(projectRoot, 'dist/bundledScenes.js');
  if (!sceneBootModule || !emptySceneList) return config;
  var sceneList = writeBundledScenesModule(projectRoot, sherloCacheFolder(projectRoot));
  if (!sceneList) return config;

  var resolveAsTheConfigDoes = applySherloTransforms.resolveThroughConfig(config);
  function resolveRequest(context, moduleName, platform) {
    var resolution = resolveAsTheConfigDoes(context, moduleName, platform);
    var isTheEmptySceneList =
      !!resolution &&
      resolution.type === 'sourceFile' &&
      path.basename(resolution.filePath) === path.basename(emptySceneList) &&
      resolvesToFile(resolution, emptySceneList);
    return isTheEmptySceneList ? { type: 'sourceFile', filePath: sceneList } : resolution;
  }

  var serializer = config.serializer || {};
  var runBeforeMainAsConfigured = serializer.getModulesRunBeforeMainModule;
  function getModulesRunBeforeMainModule(entryFilePath) {
    var asConfigured = runBeforeMainAsConfigured
      ? runBeforeMainAsConfigured.call(this, entryFilePath)
      : [];
    return asConfigured.concat([sceneBootModule]);
  }

  return Object.assign({}, config, {
    resolver: Object.assign({}, config.resolver, { resolveRequest: resolveRequest }),
    serializer: Object.assign({}, serializer, {
      getModulesRunBeforeMainModule: getModulesRunBeforeMainModule,
    }),
  });
}

/**
 * The one place that decides which road a bundle takes: the build setting, then the project's
 * Storybook setup.
 */
function withStorybook(config, opts) {
  // A config another wrapper made lazy - Metro's function form (withRozenite returns
  // `async () => config`) or a promise - is not an object yet: copying it would keep nothing.
  // Hand Metro the same function form back, applying Sherlo once the config is known.
  if (typeof config === 'function' || isPromise(config)) {
    return function withStorybookOnceResolved() {
      var lazyConfig = typeof config === 'function' ? config.apply(this, arguments) : config;
      return Promise.resolve(lazyConfig).then(function (resolved) {
        return withStorybook(resolved, opts);
      });
    };
  }

  var projectRoot = projectRootOf(config);
  var thisBuild = whatThisBuildCarries(process.env, isReleaseBundle(), opts && opts.enabled);
  var defaultSetupEntry = defaultSetupStorybookEntry(projectRoot, opts);

  if (!defaultSetupEntry && hasSceneFilesAndNoStorybook(projectRoot, opts)) {
    return withScenesOnly(config, opts, thisBuild.sherloBuild);
  }

  if (thisBuild.sherloBuild === 'off') {
    var storybookWrapper = defaultSetupEntry
      ? loadNewerStorybookWrapper(projectRoot)
      : loadOldSetupStorybookWrapper();
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
  ensureStorybookRequires(projectRoot, storybookOptions);
  var result = loadOldSetupStorybookWrapper()(config, storybookOptions);
  return withSceneBoot(applySherloTransforms(result, storybookOptions));
}

function isPromise(value) {
  return !!value && typeof value.then === 'function';
}

module.exports = withStorybook;
module.exports.default = withStorybook;
module.exports.withStorybook = withStorybook;
