'use strict';

// Storybook's default setup: the Storybook entry file (the index inside the Storybook config folder)
// registers itself as the app's root, and Storybook's own wrapper swaps the app's entry for it. That
// choice is made while bundling. Sherlo makes it at each launch instead, so one build serves the
// app, the story browser and a test: the bundle's entry becomes a small file Sherlo writes, the
// launch entry, which loads the SDK, reads the mode, and then requires either the Storybook entry
// file or the app's own entry. Metro runs a module only when something requires it, so only the
// side the launch picks runs.
//
// The entry is replaced in two places, because the two ways of bundling find it differently: the
// resolver answers the bundle's request for its entry (applyLaunchTimeEntry), and in a release
// bundle the transformer also serves the launch entry in place of the app entry's source, for the
// command that never asks the resolver (withReleaseEntryTransformer).

var fs = require('fs');
var path = require('path');
var resolveThroughConfig = require('./applySherloTransforms').resolveThroughConfig;
var projectRootOf = require('./projectPaths').projectRootOf;
var sherloCacheFolder = require('./projectPaths').sherloCacheFolder;
var firstExistingSourceFile = require('./sourceFiles').firstExistingSourceFile;
var isExistingFile = require('./sourceFiles').isExistingFile;

// The two names only the launch entry asks for. Sherlo's resolver answers them itself, so neither
// passes through Storybook's own entry swap.
var APP_SIDE_REQUEST = 'sherlo-launch-entry:app';
var STORYBOOK_SIDE_REQUEST = 'sherlo-launch-entry:storybook';

// The CLI reads the start of this message in the bundler's output (BUNDLER_SETUP_ERROR_MARKERS).
var NO_APP_ENTRY_MESSAGE =
  'Sherlo could not find your app\'s entry file. It looked for the "main" field in ' +
  "package.json, then for index.js. Sherlo needs the app's entry to choose between the app and " +
  'Storybook at launch, so add a "main" field that points to it.';

function storybookEntryImportedMessage(importer) {
  return (
    importer +
    " imports the Storybook entry file. On Storybook's default setup, Sherlo loads Storybook " +
    'itself, so remove that import.'
  );
}

/**
 * The file `filePath` really is, with every symlink on the way followed, so a project installed
 * through links (pnpm, a monorepo) names each file one way only. `filePath` as it is when it is
 * not on disk.
 */
function realFilePath(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch (_) {
    return path.resolve(filePath);
  }
}

/**
 * `basePath` itself when it is a file, else the first of it with a source extension that is one,
 * JavaScript first as Storybook's own entry swap looks (`index.js` first), symlinks followed.
 *
 * @param {string} basePath - absolute path, with or without an extension
 * @returns {string|null}
 */
function existingAppEntryFile(basePath) {
  var foundFile = isExistingFile(basePath)
    ? basePath
    : firstExistingSourceFile(basePath, 'javascript-first');
  return foundFile ? realFilePath(foundFile) : null;
}

/**
 * The app's entry file, found the way the project's bundler finds it: the `main` field of the
 * project's package.json, as a file in the project or as a package the project can load (such as
 * `expo-router/entry`), else `index` with an entry extension.
 *
 * @param {string} projectRoot - absolute path to the project
 * @returns {string} absolute path to the app's entry file, symlinks followed
 * @throws {Error} when the project has none
 */
function findAppEntry(projectRoot) {
  var packageJsonPath = path.join(projectRoot, 'package.json');
  var mainField = fs.existsSync(packageJsonPath)
    ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).main
    : undefined;

  if (typeof mainField === 'string' && mainField) {
    var mainAsProjectFile = existingAppEntryFile(path.resolve(projectRoot, mainField));
    if (mainAsProjectFile) return mainAsProjectFile;

    try {
      // Node follows symlinks here itself.
      return require('module').createRequire(packageJsonPath).resolve(mainField);
    } catch (_) {
      // Not a package the project can load either: look for index next.
    }
  }

  var indexFile = existingAppEntryFile(path.join(projectRoot, 'index'));
  if (indexFile) return indexFile;

  throw new Error(NO_APP_ENTRY_MESSAGE);
}

/**
 * The source of the launch entry for a build that carries `sherloBuild`.
 *
 * - `storybook`: Storybook alone, so the app's entry is never required and a release bundle holds
 *   none of the app's side.
 * - `app-and-storybook`: the mode, read through the native module, picks the side at launch.
 *
 * Either way the SDK's own index loads first, so the sealed core loads and the signals a test run
 * reads are written on this setup too.
 *
 * @param {'storybook'|'app-and-storybook'} sherloBuild
 * @returns {string}
 */
function launchEntrySource(sherloBuild) {
  var header =
    "'use strict';\n" +
    "// Generated by Sherlo's withStorybook: picks Storybook or the app at each launch.\n" +
    "require('@sherlo/react-native-storybook');\n";

  if (sherloBuild === 'storybook') {
    return header + "require('" + STORYBOOK_SIDE_REQUEST + "');\n";
  }

  return (
    header +
    "var mode = require('@sherlo/react-native-storybook/dist/SherloModule.js').default.getMode();\n" +
    "if (mode === 'storybook' || mode === 'testing') {\n" +
    "  require('" +
    STORYBOOK_SIDE_REQUEST +
    "');\n" +
    '} else {\n' +
    "  require('@sherlo/react-native-storybook/dist/addStorybookToDevMenu.js').default();\n" +
    "  require('@sherlo/react-native-storybook/dist/openStoryChannel.js').startWaitingAsTheApp();\n" +
    "  require('" +
    APP_SIDE_REQUEST +
    "');\n" +
    '}\n'
  );
}

/**
 * Whether Metro is resolving the bundle's own entry file. Metro asks for the entry from a module
 * that does not exist, the folder it bundles from followed by `/.`, where every other request
 * comes from a real file.
 */
function isTheBundleEntryRequest(context) {
  return path.basename(context.originModulePath) === '.';
}

// `realFile` is a path with its symlinks already followed.
function resolvesToFile(resolution, realFile) {
  return (
    !!resolution &&
    resolution.type === 'sourceFile' &&
    realFilePath(resolution.filePath) === realFile
  );
}

/**
 * Whether Metro's own resolver, without the project's or Storybook's steps, finds `moduleName` to
 * be the app's entry. Storybook's newer wrapper answers every import of the app's entry, not only
 * the bundle's, with the Storybook entry file; this tells such an import from a real import of the
 * Storybook entry file.
 */
function namesTheAppEntry(context, moduleName, platform, realAppEntry) {
  try {
    return resolvesToFile(context.resolveRequest(context, moduleName, platform), realAppEntry);
  } catch (_) {
    return false;
  }
}

/**
 * Makes the bundle's entry Sherlo's launch entry, on a config that has already been through
 * Storybook's newer wrapper and Sherlo's transforms.
 *
 * - The bundle's own request for its entry, which Storybook's wrapper answers with the Storybook
 *   entry file, is answered with the launch entry Sherlo writes into its cache folder. A web
 *   bundle gets the app's own entry instead.
 * - The launch entry's two side requests are answered with the Storybook entry file and the app's
 *   entry.
 * - Any other module that imports the app's entry gets the app's entry, which Storybook's wrapper
 *   would have swapped too. Any other module that imports the Storybook entry file is refused,
 *   naming it.
 * - `npx react-native bundle` hands Metro the entry as a path and never asks the resolver, so in a
 *   release bundle Sherlo's release entry transformer (withReleaseEntryTransformer) also serves the
 *   launch entry in place of the app entry's source. There the app entry holds the launch entry,
 *   so the app side is a copy of the app entry, and a request from the copy resolves as if it
 *   came from the app entry. A development bundle never reads the copy.
 *
 * Files are compared with their symlinks followed, so a linked install cannot skip the swap.
 *
 * @param {object} config - the Metro config so far
 * @param {string} storybookEntryAsFound - absolute path to the project's Storybook entry file
 * @param {'storybook'|'app-and-storybook'} sherloBuild - what this build carries
 * @returns {object} the Metro config with the launch entry and the release entry transformer in
 *   place
 * @throws {Error} when the project has no app entry
 */
function applyLaunchTimeEntry(config, storybookEntryAsFound, sherloBuild) {
  var projectRoot = projectRootOf(config);
  var appEntry = findAppEntry(projectRoot);
  var storybookEntry = realFilePath(storybookEntryAsFound);
  var appEntryCopy = appEntryCopyPath(projectRoot, appEntry);

  var cacheDir = sherloCacheFolder(projectRoot);
  fs.mkdirSync(cacheDir, { recursive: true });
  var launchEntryPath = path.join(cacheDir, 'launch-entry.js');
  fs.writeFileSync(launchEntryPath, launchEntrySource(sherloBuild), 'utf8');

  var resolveAsTheConfigDoes = resolveThroughConfig(config);

  function resolveRequest(contextAsAsked, moduleName, platform) {
    // The copy of the app entry resolves its imports as the app entry itself does.
    var context =
      contextAsAsked.originModulePath === appEntryCopy
        ? Object.assign({}, contextAsAsked, { originModulePath: appEntry })
        : contextAsAsked;
    var importer = context.originModulePath;

    // In a release bundle the app entry holds the launch entry too: the transformer served it.
    var isALaunchEntry = importer === launchEntryPath || importer === appEntry;
    if (isALaunchEntry && moduleName === STORYBOOK_SIDE_REQUEST) {
      return { type: 'sourceFile', filePath: storybookEntry };
    }
    if (isALaunchEntry && moduleName === APP_SIDE_REQUEST) {
      var isReleaseBundle = importer === appEntry || context.dev === false;
      return { type: 'sourceFile', filePath: isReleaseBundle ? appEntryCopy : appEntry };
    }

    var resolution = resolveAsTheConfigDoes(context, moduleName, platform);

    if (isTheBundleEntryRequest(context)) {
      var isEitherEntry =
        resolvesToFile(resolution, appEntry) || resolvesToFile(resolution, storybookEntry);
      if (!isEitherEntry) return resolution;
      if (platform === 'web') return { type: 'sourceFile', filePath: appEntry };
      return { type: 'sourceFile', filePath: launchEntryPath };
    }

    if (!resolvesToFile(resolution, storybookEntry)) return resolution;

    if (namesTheAppEntry(context, moduleName, platform, appEntry)) {
      return { type: 'sourceFile', filePath: appEntry };
    }
    throw new Error(storybookEntryImportedMessage(path.relative(projectRoot, importer)));
  }

  var withLaunchEntry = Object.assign({}, config, {
    resolver: Object.assign({}, config.resolver, { resolveRequest: resolveRequest }),
  });
  return withReleaseEntryTransformer(withLaunchEntry, sherloBuild);
}

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
 * The source of the Babel transformer a release bundle's app entry passes through. It serves
 * `launchEntryCode` in place of the app entry's own source when Metro bundles for a release and not
 * for the web, and hands every file, the app entry included, to the project's own transformer.
 *
 * The launch entry's source is written into the file, not read at transform time: Metro keys its
 * transform cache on the transformer file's contents, so a new launch entry is never served from
 * an old cache.
 *
 * @param {string} projectTransformer - the project's own babelTransformerPath
 * @param {string} appEntry - absolute path to the app's entry file, symlinks followed
 * @param {string} launchEntryCode - the launch entry's source code
 * @returns {string}
 */
function releaseEntryTransformerSource(projectTransformer, appEntry, launchEntryCode) {
  return (
    "'use strict';\n" +
    "// Generated by Sherlo's withStorybook: in a release bundle, serves the launch entry in place\n" +
    "// of the app entry's source. Every file then goes to the project's own transformer.\n" +
    "var fs = require('fs');\n" +
    "var path = require('path');\n" +
    'var projectTransformer = require(' +
    JSON.stringify(projectTransformer) +
    ');\n' +
    'var APP_ENTRY = ' +
    JSON.stringify(appEntry) +
    ';\n' +
    'var LAUNCH_ENTRY_SOURCE = ' +
    JSON.stringify(launchEntryCode) +
    ';\n' +
    '\n' +
    'function isTheAppEntry(filename, projectRoot) {\n' +
    '  var filePath = path.resolve(projectRoot, filename);\n' +
    '  if (path.basename(filePath) !== path.basename(APP_ENTRY)) return false;\n' +
    '  try {\n' +
    '    return fs.realpathSync(filePath) === APP_ENTRY;\n' +
    '  } catch (_) {\n' +
    '    return false;\n' +
    '  }\n' +
    '}\n' +
    '\n' +
    'module.exports = Object.assign({}, projectTransformer, {\n' +
    '  transform: function (args) {\n' +
    '    var servesTheLaunchEntry =\n' +
    '      args.options.dev === false &&\n' +
    "      args.options.platform !== 'web' &&\n" +
    '      isTheAppEntry(args.filename, args.options.projectRoot);\n' +
    '    if (!servesTheLaunchEntry) return projectTransformer.transform(args);\n' +
    '    return projectTransformer.transform(Object.assign({}, args, { src: LAUNCH_ENTRY_SOURCE }));\n' +
    '  },\n' +
    '});\n'
  );
}

/**
 * The project's own Babel transformer, as a file Sherlo's transformer can load from its cache
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
 * Sherlo's release entry transformer, in place of the project's own, which it hands every file to.
 * In a bundle made with `dev` false it serves the launch entry's source in place of the app
 * entry's, for `npx react-native bundle`, which never asks the resolver for the entry. It also
 * writes the copy of the app entry that such a bundle runs as its app side (applyLaunchTimeEntry
 * resolves the copy).
 *
 * A development server never takes this road, so it never reads the copy, and the copy cannot go
 * stale while a developer edits.
 *
 * @param {object} config - a Metro config
 * @param {'storybook'|'app-and-storybook'} sherloBuild - what this build carries
 * @returns {object} the Metro config with the transformer in place
 */
function withReleaseEntryTransformer(config, sherloBuild) {
  var projectRoot = projectRootOf(config);
  var appEntry = findAppEntry(projectRoot);
  fs.copyFileSync(appEntry, appEntryCopyPath(projectRoot, appEntry));

  var transformerPath = path.join(sherloCacheFolder(projectRoot), 'release-entry-transformer.js');
  fs.writeFileSync(
    transformerPath,
    releaseEntryTransformerSource(
      projectTransformerFile(config),
      appEntry,
      launchEntrySource(sherloBuild)
    ),
    'utf8'
  );

  return Object.assign({}, config, {
    transformer: Object.assign({}, config.transformer, { babelTransformerPath: transformerPath }),
  });
}

module.exports = {
  findAppEntry: findAppEntry,
  launchEntrySource: launchEntrySource,
  applyLaunchTimeEntry: applyLaunchTimeEntry,
  APP_SIDE_REQUEST: APP_SIDE_REQUEST,
  STORYBOOK_SIDE_REQUEST: STORYBOOK_SIDE_REQUEST,
  NO_APP_ENTRY_MESSAGE: NO_APP_ENTRY_MESSAGE,
};
