'use strict';

// ---------------------------------------------------------------------------
// Scene files - found at bundle time
// ---------------------------------------------------------------------------
//
// A scene file is `chat.scenes.tsx`, sitting beside the screen it shows. It calls the SDK's
// `scenes({ scenes: { Conversation: {...}, Empty: {...} } })`, and each key of the inner object is
// one scene. The build lists every scene with an id of the file's name and the scene's name
// (`chat--conversation`), the way Storybook ids a story. Nothing is evaluated and no Storybook is
// read: the file is parsed shallowly, as mockScan.js parses a story.

var fs = require('fs');
var path = require('path');

var givenReader = require('./givenReader');
var refuseWrongInputs = require('./sceneInputs').refuseWrongInputs;
var mockScan = require('./mockScan');
var sourceFiles = require('./sourceFiles');
var toRelativePath = require('./projectPaths').toRelativePath;
// The same rule that turns a story's title into the first part of its id.
var idPart = require('./sherloLine').idPartOfTitle;

/**
 * An export name or a file name in words, the way Storybook's `storyNameFromExport` makes a story's
 * name (`toStartCaseStr`): `MenuOpen` is "Menu Open", `SignIn` is "Sign In". It is the one place
 * the SDK makes words: a scene's name, a scene file's title and the id part all come from it.
 */
function wordsOfName(name) {
  return String(name)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\./g, ' ')
    .replace(/([^\n])([A-Z])([a-z])/g, '$1 $2$3')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-z])([0-9])/gi, '$1 $2')
    .replace(/([0-9])([a-z])/gi, '$1 $2')
    .replace(/(\s|^)(\w)/g, function (_match, space, letter) {
      return space + letter.toUpperCase();
    })
    .replace(/ +/g, ' ')
    .trim();
}

/**
 * A scene's name the way Storybook turns a story's export name into the second part of its id:
 * `storyNameFromExport` splits the name into words (`MenuOpen` is "Menu Open", `Item2Full` is
 * "Item 2 Full"), then `toId` sanitizes. Follows storybook/internal/csf (`toStartCaseStr` and
 * `sanitize`), which an app without Storybook does not carry, so the rule is written out here.
 */
function namePart(name) {
  return wordsOfName(name)
    .toLowerCase()
    .replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

var keyName = givenReader.keyName;

// Every `scenes(...)` call, by name or off a namespace.
function isScenesCall(node) {
  if (node.type !== 'CallExpression' || !node.callee) return false;
  var callee = node.callee;
  if (callee.type === 'Identifier') return callee.name === 'scenes';
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property &&
    callee.property.name === 'scenes'
  );
}

// The value node of the property `name` of an object node, or null.
function propertyNamed(object, name) {
  if (!object || object.type !== 'ObjectExpression') return null;
  for (var i = 0; i < object.properties.length; i++) {
    var prop = object.properties[i];
    if (prop.type === 'ObjectProperty' && keyName(prop) === name) return prop.value;
  }
  return null;
}

// A key a scene file used before `given`: one refuses the file, naming it and the new way.
var OLD_KEYS = ['setup', 'device', 'mocks'];

function refuseOldKeys(fileName, object, where) {
  OLD_KEYS.forEach(function (key) {
    if (!propertyNamed(object, key)) return;
    throw new Error(
      'Scene file ' +
        fileName +
        ': ' +
        where +
        ' has a "' +
        key +
        '" key, which scenes no longer take. List what the scene starts from in "given" instead, such as given: [signedOut(), mock(...)].'
    );
  });
}

// Calls `visit(name, sceneValue, definition)` for each scene one file's source declares, in order:
// the scene's key, its value node and the object the file handed to `scenes()`.
function eachSceneOf(fileName, source, visit) {
  var ast = mockScan.parseScanTarget(source);
  if (!ast) return;

  mockScan.walkNodes(ast.program || ast, function (node) {
    if (!isScenesCall(node)) return;
    var definition = (node.arguments || [])[0];
    if (!definition || definition.type !== 'ObjectExpression') return;
    refuseOldKeys(fileName, definition, 'the file');
    definition.properties.forEach(function (prop) {
      if (prop.type !== 'ObjectProperty' || keyName(prop) !== 'scenes') return;
      if (!prop.value || prop.value.type !== 'ObjectExpression') return;
      prop.value.properties.forEach(function (sceneProp) {
        var name = sceneProp.type === 'ObjectProperty' ? keyName(sceneProp) : null;
        if (!name) return;
        refuseOldKeys(fileName, sceneProp.value, 'scene ' + name);
        refuseWrongInputs(path.basename(fileName), name, sceneProp.value);
        visit(name, sceneProp.value, definition);
      });
    });
  });
}

// The names of the scenes one file's source declares.
function sceneNamesOf(fileName, source) {
  var names = [];
  eachSceneOf(fileName, source, function (name) {
    names.push(name);
  });
  return names;
}

/**
 * The phone setup of each scene one scene file declares, from evaluating its `given` list while the
 * bundle is made (metro/givenReader.js): the permissions, the location and the member that its
 * preconditions set, a later one winning.
 *
 * @param {string} fileName - the file's name, such as `chat.scenes.tsx`; a full path lets the
 *   functions the file imports from beside it be followed
 * @param {string} source - the file's source
 * @returns {Object<string, {permissions?: object, location?: object, member?: string}>} by the
 *   scene's key in the file
 * @throws when a phone setting cannot be worked out, or the file uses a key `given` replaced
 */
function sceneDevicesOf(fileName, source) {
  var devices = {};
  var givens = givenOfScenes(fileName, source);
  Object.keys(givens).forEach(function (name) {
    devices[name] = givens[name].device;
  });
  return devices;
}

// What each scene's `given` list holds for the bundle, by the scene's key: its phone settings, which
// of its entries a shared file built, and the files read to know (givenReader.readGiven).
function givenOfScenes(fileName, source) {
  var givens = {};
  eachSceneOf(fileName, source, function (name, sceneValue) {
    var given = propertyNamed(sceneValue, 'given');
    givens[name] = given
      ? givenReader.readGiven(given, fileName, source, 'scene ' + name)
      : { device: {}, shared: false, files: [] };
  });
  return givens;
}

/**
 * The ids of the scenes one scene file declares.
 *
 * @param {string} fileName - the file's name, such as `chat.scenes.tsx`
 * @param {string} source - the file's source
 * @returns {string[]} ids such as `chat--conversation`, in the order the file lists them
 */
function sceneIdsOfSource(fileName, source) {
  return scenesOfSource(fileName, source).map(function (scene) {
    return scene.id;
  });
}

// Each scene one scene file declares, in the order it lists them: its id, its key in the file, its
// component title and its name, both in words (`Sign In`, `Menu Open`).
function scenesOfSource(fileName, source) {
  var component = sourceFiles.basenameWithoutExtension(fileName).replace(/\.scenes$/, '');
  return sceneNamesOf(fileName, source).map(function (key) {
    return {
      id: idPart(component) + '--' + namePart(key),
      key: key,
      title: wordsOfName(component),
      name: wordsOfName(key),
    };
  });
}

/**
 * Absolute paths of every scene file under `projectRoot`, skipping the folders no first-party
 * source sits in. An unreadable folder is skipped, never an error.
 *
 * @param {string} projectRoot
 * @returns {string[]}
 */
function findSceneFiles(projectRoot) {
  return mockScan.findFiles(projectRoot, sourceFiles.isSceneFile).sort();
}

/**
 * The ids of every scene in the project, each once: files in path order, each file's scenes in the
 * order it declares them. The CLI reads the manifest's ids as a set, so this order serves it.
 *
 * @param {string} projectRoot
 * @returns {string[]}
 */
function readSceneIds(projectRoot) {
  return Object.keys(scenesOfProject(projectRoot));
}

// Every scene in the project by its id: its name, its file (symlinks followed) and its phone
// settings, member included. A scene whose id two scenes declare is refused, naming both files;
// an unreadable file declares none.
function scenesOfProject(projectRoot) {
  var scenes = {};
  var realRoot = fs.realpathSync(projectRoot);
  findSceneFiles(projectRoot).forEach(function (file) {
    var source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch (_) {
      return;
    }
    var realFile = fs.realpathSync(file);
    var givens = givenOfScenes(realFile, source);
    scenesOfSource(path.basename(file), source).forEach(function (scene) {
      var first = scenes[scene.id];
      if (first) {
        throw new Error(
          'Two scenes have the id ' +
            scene.id +
            ': ' +
            first.key +
            ' in ' +
            toRelativePath(first.file, realRoot) +
            ' and ' +
            scene.key +
            ' in ' +
            toRelativePath(realFile, realRoot) +
            '. Give one of them another name.'
        );
      }
      scenes[scene.id] = {
        key: scene.key,
        title: scene.title,
        name: scene.name,
        file: realFile,
        device: givens[scene.key].device,
        shared: givens[scene.key].shared,
        reads: givens[scene.key].files,
      };
    });
  });
  return scenes;
}

/**
 * Writes the module the bundle answers the SDK's list of its scenes with (src/bundledScenes.ts):
 * each scene by its id, with its file from the project root, its name in that file, and a
 * function that requires the file, so a file is required only by the launch that opens one of its
 * scenes.
 *
 * @param {string} projectRoot
 * @param {string} cacheDir - the folder the module is written into
 * @param {boolean} [installWithNoScene] - write a list with no scene in it when the project has none,
 *   so the watcher has a list to write the first scene into
 * @returns {string|null} the module's path, or null when the project has no scene and
 *   `installWithNoScene` is not set
 */
function writeBundledScenesModule(projectRoot, cacheDir, installWithNoScene) {
  var scenes = scenesOfProject(projectRoot);
  if (Object.keys(scenes).length === 0 && !installWithNoScene) return null;
  return writeSceneList(projectRoot, cacheDir, scenes);
}

/**
 * Keeps the module writeBundledScenesModule wrote in step with the scene files while the bundler
 * runs. Each time the bundler's file watcher tells of a scene file added, changed or removed, the
 * list is written again from the files as they are now. That write is itself a change the watcher
 * tells the bundler of, so the next bundle the app loads holds the list as it is, with no restart.
 *
 * @param {{ on: Function }} watcher - Metro's file watcher. Its `change` event, from Metro 0.84
 *   (metro-file-map src/index.js), carries `changes`, whose `addedFiles`, `modifiedFiles` and
 *   `removedFiles` are each an iterable of `[path, metadata]`, the path relative to `rootDir`; from
 *   Metro 0.83 and older, it carries `eventsQueue`, each event with the absolute `filePath`
 * @param {string} projectRoot
 * @param {string} cacheDir - the folder the module is written into
 */
function keepSceneListCurrent(watcher, projectRoot, cacheDir) {
  // The files the scenes' lists were worked out from besides the scene files: a change to one of
  // them changes what a scene starts from, so the list is written again.
  var readFiles = [];
  var realRoot = fs.realpathSync(projectRoot);
  var readAgain = function (writeTheList) {
    var scenes = scenesOfProject(projectRoot);
    readFiles = [].concat.apply(
      [],
      Object.keys(scenes).map(function (id) {
        return scenes[id].reads;
      })
    );
    if (writeTheList) writeSceneList(projectRoot, cacheDir, scenes);
  };
  try {
    readAgain(false);
  } catch (_) {
    // Whatever stops this first reading stops the bundle's own, which names it.
  }
  watcher.on('change', function (change) {
    var changedReadFile = pathsOfChange(change).some(function (changed) {
      return readFiles.indexOf(path.resolve(realRoot, changed)) !== -1;
    });
    if (!aSceneFileChanged(change) && !changedReadFile) return;
    try {
      readAgain(true);
    } catch (_) {
      // A scan that fails, such as on a file removed while it was read, leaves the list as it was:
      // the watcher's next change writes it again. Nothing is thrown into the bundler's watcher.
    }
  });
}

// Metro 0.84 tells of a change as "changes": added, modified and removed files, each an iterable
// of [path, metadata]. Metro 0.83 and older (React Native 0.81 to 0.83) tell of it as
// "eventsQueue": a list of events, each with the absolute "filePath". The SDK supports both.
function pathsOfChange(change) {
  if (!change) return [];
  var paths = [];
  ['addedFiles', 'modifiedFiles', 'removedFiles'].forEach(function (kind) {
    var files = change.changes && change.changes[kind];
    if (!files) return;
    Array.from(files).forEach(function (entry) {
      if (Array.isArray(entry)) paths.push(entry[0]);
    });
  });
  (change.eventsQueue || []).forEach(function (event) {
    if (event) paths.push(event.filePath);
  });
  return paths.filter(function (filePath) {
    return typeof filePath === 'string';
  });
}

function aSceneFileChanged(change) {
  return pathsOfChange(change).some(isSceneFilePath);
}

/**
 * The file watcher of a running Metro server: the one its dependency graph rebuilds from, reached
 * the way Metro's own incremental bundler reaches it. Null when this Metro has no such road.
 */
function fileWatcherOfMetro(metroServer) {
  try {
    var watcher = metroServer.getBundler().getBundler().getWatcher();
    return watcher && typeof watcher.on === 'function' ? watcher : null;
  } catch (_) {
    // No such road on this Metro: whoever asked keeps what it had when the bundler started.
    return null;
  }
}

function isSceneFilePath(filePath) {
  return sourceFiles.isSceneFile(path.basename(filePath));
}

// Writes the list of `scenes` into `cacheDir`, unless the file already says exactly that: every
// write is a change the bundler rebuilds for.
function writeSceneList(projectRoot, cacheDir, scenes) {
  var ids = Object.keys(scenes);
  var realProjectRoot = fs.realpathSync(projectRoot);
  var entries = ids.map(function (id) {
    var scene = scenes[id];
    return (
      '  ' +
      JSON.stringify(id) +
      ': {\n' +
      ('    filePath: ' + JSON.stringify(toRelativePath(scene.file, realProjectRoot)) + ',\n') +
      ('    sceneName: ' + JSON.stringify(scene.key) + ',\n') +
      ('    title: ' + JSON.stringify(scene.title) + ',\n') +
      ('    name: ' + JSON.stringify(scene.name) + ',\n') +
      ('    device: ' + JSON.stringify(scene.device) + ',\n') +
      ('    shared: ' + JSON.stringify(scene.shared) + ',\n') +
      ('    loadFile: function () { return require(' + JSON.stringify(scene.file) + '); },\n') +
      '  },\n'
    );
  });
  var source =
    "'use strict';\n" +
    "// Generated by Sherlo's withStorybook: the scenes this bundle holds (src/bundledScenes.ts).\n" +
    "Object.defineProperty(exports, '__esModule', { value: true });\n" +
    'exports.default = {\n' +
    entries.join('') +
    '};\n';

  var modulePath = bundledScenesModulePath(cacheDir);
  if (readFileOrNull(modulePath) === source) return modulePath;
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(modulePath, source, 'utf8');
  return modulePath;
}

// Where the list of scenes sits in `cacheDir`.
function bundledScenesModulePath(cacheDir) {
  return path.join(cacheDir, 'bundled-scenes.js');
}

function readFileOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    // No file yet: there is nothing to compare with.
    return null;
  }
}

module.exports = {
  findSceneFiles: findSceneFiles,
  keepSceneListCurrent: keepSceneListCurrent,
  pathsOfChange: pathsOfChange,
  fileWatcherOfMetro: fileWatcherOfMetro,
  sceneIdsOfSource: sceneIdsOfSource,
  sceneDevicesOf: sceneDevicesOf,
  scenesOfProject: scenesOfProject,
  readSceneIds: readSceneIds,
  writeBundledScenesModule: writeBundledScenesModule,
  bundledScenesModulePath: bundledScenesModulePath,
};
