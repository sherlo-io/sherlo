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
  var fileId = idPart(sourceFiles.basenameWithoutExtension(fileName).replace(/\.scenes$/, ''));
  return sceneNamesOf(source).map(function (name) {
    return fileId + '--' + idPart(name);
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
  var ids = {};
  findSceneFiles(projectRoot).forEach(function (file) {
    var source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch (_) {
      return;
    }
    sceneIdsOfSource(path.basename(file), source).forEach(function (id) {
      ids[id] = true;
    });
  });
  return Object.keys(ids).sort();
}

module.exports = {
  findSceneFiles: findSceneFiles,
  sceneIdsOfSource: sceneIdsOfSource,
  readSceneIds: readSceneIds,
};
