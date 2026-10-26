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

// The static name of an object property key; null for a computed or numeric key.
function keyName(prop) {
  if (!prop.key || prop.computed) return null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'StringLiteral') return prop.key.value;
  return null;
}

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

// Calls `visit(name, sceneValue, definition)` for each scene one file's source declares, in order:
// the scene's key, its value node and the object the file handed to `scenes()`.
function eachSceneOf(source, visit) {
  var ast = mockScan.parseScanTarget(source);
  if (!ast) return;

  mockScan.walkNodes(ast.program || ast, function (node) {
    if (!isScenesCall(node)) return;
    var definition = (node.arguments || [])[0];
    if (!definition || definition.type !== 'ObjectExpression') return;
    definition.properties.forEach(function (prop) {
      if (prop.type !== 'ObjectProperty' || keyName(prop) !== 'scenes') return;
      if (!prop.value || prop.value.type !== 'ObjectExpression') return;
      prop.value.properties.forEach(function (sceneProp) {
        var name = sceneProp.type === 'ObjectProperty' ? keyName(sceneProp) : null;
        if (name) visit(name, sceneProp.value, definition);
      });
    });
  });
}

// The names of the scenes one file's source declares.
function sceneNamesOf(source) {
  var names = [];
  eachSceneOf(source, function (name) {
    names.push(name);
  });
  return names;
}

// The plain value a literal node stands for: strings, numbers (a minus sign allowed), booleans,
// null, and objects and arrays of those. Anything else (an identifier, a spread, a call) throws
// `NotLiteral`, because the phone is set before the app starts and nothing is run to get a value.
function literalValueOf(node) {
  node = mockScan.unwrapExpression(node);
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return node.value;
  if (node.type === 'BooleanLiteral') return node.value;
  if (node.type === 'NullLiteral') return null;
  if (
    node.type === 'UnaryExpression' &&
    node.operator === '-' &&
    node.argument.type === 'NumericLiteral'
  ) {
    return -node.argument.value;
  }
  if (node.type === 'ArrayExpression') {
    return node.elements.map(function (element) {
      if (!element) throw new Error('NotLiteral');
      return literalValueOf(element);
    });
  }
  if (node.type === 'ObjectExpression') {
    var value = {};
    node.properties.forEach(function (prop) {
      var name = prop.type === 'ObjectProperty' ? keyName(prop) : null;
      if (name === null) throw new Error('NotLiteral');
      value[name] = literalValueOf(prop.value);
    });
    return value;
  }
  throw new Error('NotLiteral');
}

// The `device` literal among an object's properties, or null; `where` names it in a refusal.
function deviceLiteralOf(object, fileName, where) {
  if (!object || object.type !== 'ObjectExpression') return null;
  for (var i = 0; i < object.properties.length; i++) {
    var prop = object.properties[i];
    if (prop.type !== 'ObjectProperty' || keyName(prop) !== 'device') continue;
    try {
      return literalValueOf(prop.value);
    } catch (error) {
      if (error.message !== 'NotLiteral') throw error;
      throw new Error(
        'Scene file ' +
          fileName +
          ': the device field of ' +
          where +
          ' must be a plain literal (no variable, spread or call), because the phone is set before the app starts.'
      );
    }
  }
  return null;
}

/**
 * The phone setup of each scene one scene file declares: the `device` literal of the file merged
 * with the scene's own, the scene's winning per permission and for the location.
 *
 * @param {string} fileName - the file's name, such as `chat.scenes.tsx`
 * @param {string} source - the file's source
 * @returns {Object<string, {permissions?: object, location?: object}>} by the scene's key in the file
 * @throws when a `device` value is not a literal, naming the file and the scene
 */
function sceneDevicesOf(fileName, source) {
  var devices = {};
  eachSceneOf(source, function (name, sceneValue, definition) {
    var fileDevice = deviceLiteralOf(definition, fileName, 'the file') || {};
    var own = deviceLiteralOf(sceneValue, fileName, 'scene ' + name) || {};
    var merged = {};
    var permissions = Object.assign({}, fileDevice.permissions, own.permissions);
    if (Object.keys(permissions).length > 0) merged.permissions = permissions;
    var location = own.location || fileDevice.location;
    if (location) merged.location = location;
    devices[name] = merged;
  });
  return devices;
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
  return sceneNamesOf(source).map(function (key) {
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

// Every scene in the project by its id: its name and its file, symlinks followed. A scene whose
// id two files declare keeps the first file's; an unreadable file declares none.
function scenesOfProject(projectRoot) {
  var scenes = {};
  findSceneFiles(projectRoot).forEach(function (file) {
    var source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch (_) {
      return;
    }
    scenesOfSource(path.basename(file), source).forEach(function (scene) {
      if (!scenes[scene.id]) {
        scenes[scene.id] = {
          key: scene.key,
          title: scene.title,
          name: scene.name,
          file: fs.realpathSync(file),
        };
      }
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
 * @returns {string|null} the module's path, or null when the project has no scene
 */
function writeBundledScenesModule(projectRoot, cacheDir) {
  var scenes = scenesOfProject(projectRoot);
  if (Object.keys(scenes).length === 0) return null;
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
  watcher.on('change', function (change) {
    if (!aSceneFileChanged(change)) return;
    try {
      writeSceneList(projectRoot, cacheDir, scenesOfProject(projectRoot));
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

  var modulePath = path.join(cacheDir, 'bundled-scenes.js');
  if (readFileOrNull(modulePath) === source) return modulePath;
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(modulePath, source, 'utf8');
  return modulePath;
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
  readSceneIds: readSceneIds,
  writeBundledScenesModule: writeBundledScenesModule,
};
