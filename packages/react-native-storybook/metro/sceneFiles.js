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

// The names of the scenes one file's source declares.
function sceneNamesOf(source) {
  var ast = mockScan.parseScanTarget(source);
  if (!ast) return [];

  var names = [];
  mockScan.walkNodes(ast.program || ast, function (node) {
    if (!isScenesCall(node)) return;
    var definition = (node.arguments || [])[0];
    if (!definition || definition.type !== 'ObjectExpression') return;
    definition.properties.forEach(function (prop) {
      if (prop.type !== 'ObjectProperty' || keyName(prop) !== 'scenes') return;
      if (!prop.value || prop.value.type !== 'ObjectExpression') return;
      prop.value.properties.forEach(function (sceneProp) {
        var name = sceneProp.type === 'ObjectProperty' ? keyName(sceneProp) : null;
        if (name) names.push(name);
      });
    });
  });
  return names;
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

// Each scene one scene file declares: its id and its name in the file, in the order it lists them.
function scenesOfSource(fileName, source) {
  var fileId = idPart(sourceFiles.basenameWithoutExtension(fileName).replace(/\.scenes$/, ''));
  return sceneNamesOf(source).map(function (name) {
    return { id: fileId + '--' + idPart(name), name: name };
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
  return mockScan.findFiles(projectRoot, sourceFiles.isSceneFile);
}

/**
 * The ids of every scene in the project, sorted, each once.
 *
 * @param {string} projectRoot
 * @returns {string[]}
 */
function readSceneIds(projectRoot) {
  return Object.keys(scenesOfProject(projectRoot)).sort();
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
      if (!scenes[scene.id]) scenes[scene.id] = { name: scene.name, file: fs.realpathSync(file) };
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
  var ids = Object.keys(scenes).sort();
  if (ids.length === 0) return null;

  var realProjectRoot = fs.realpathSync(projectRoot);
  var entries = ids.map(function (id) {
    var scene = scenes[id];
    return (
      '  ' +
      JSON.stringify(id) +
      ': {\n' +
      ('    filePath: ' + JSON.stringify(toRelativePath(scene.file, realProjectRoot)) + ',\n') +
      ('    sceneName: ' + JSON.stringify(scene.name) + ',\n') +
      ('    loadFile: function () { return require(' + JSON.stringify(scene.file) + '); },\n') +
      '  }'
    );
  });

  var modulePath = path.join(cacheDir, 'bundled-scenes.js');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    modulePath,
    "'use strict';\n" +
      "// Generated by Sherlo's withStorybook: the scenes this bundle holds (src/bundledScenes.ts).\n" +
      "Object.defineProperty(exports, '__esModule', { value: true });\n" +
      'exports.default = {\n' +
      entries.join(',\n') +
      ',\n};\n',
    'utf8'
  );
  return modulePath;
}

module.exports = {
  findSceneFiles: findSceneFiles,
  sceneIdsOfSource: sceneIdsOfSource,
  readSceneIds: readSceneIds,
  writeBundledScenesModule: writeBundledScenesModule,
};
