'use strict';

// Tells Storybook's default setup from its old one by reading the Storybook entry file (the
// index inside the Storybook config folder) and nothing else. No version number is read.
//
//   default setup: the entry file registers itself as the app's root, by calling
//                  registerRootComponent(...) or AppRegistry.registerComponent(...)
//   old setup:     the entry file only exports a component, and the app renders it
//
// The file is parsed and only real calls count, so the same words written inside a comment, a
// string or a template literal are ignored.

var fs = require('fs');
var path = require('path');
var resolveConfigDir = require('./ensureStorybookRequires').resolveConfigDir;
var getBabelParser = require('./babelParser');
var SOURCE_EXTENSIONS = require('./sourceFiles').SOURCE_EXTENSIONS;

/**
 * The paths the Storybook entry file can have in a config folder, best first. This is the one
 * rule for which file is the entry: findStorybookEntry reads the disk with it, and the module
 * graph's side (applySherloTransforms.js) asks the same list.
 *
 * @param {string} configFolder - absolute path to the Storybook config folder
 * @returns {string[]}
 */
function storybookEntryCandidates(configFolder) {
  return SOURCE_EXTENSIONS.map(function (extension) {
    return path.join(configFolder, 'index' + extension);
  });
}

/**
 * @param {string} projectRoot - absolute path to the project
 * @param {string} [configPath] - the Storybook config folder, relative to projectRoot or absolute;
 *   when omitted, the first default folder that exists
 * @returns {string|null} absolute path to the Storybook entry file, or null when there is none
 */
function findStorybookEntry(projectRoot, configPath) {
  var configFolder = resolveConfigDir(projectRoot, { configPath: configPath });
  if (!configFolder) return null;

  var existingEntries = storybookEntryCandidates(configFolder).filter(function (entryPath) {
    return fs.existsSync(entryPath);
  });
  return existingEntries.length > 0 ? existingEntries[0] : null;
}

// `registerRootComponent(...)`
function isRegisterRootComponentCall(callee) {
  return callee.type === 'Identifier' && callee.name === 'registerRootComponent';
}

// `AppRegistry.registerComponent(...)`
function isAppRegistryRegisterComponentCall(callee) {
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'AppRegistry' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'registerComponent'
  );
}

function registersRootComponent(node) {
  if (
    node.type === 'CallExpression' &&
    (isRegisterRootComponentCall(node.callee) || isAppRegistryRegisterComponentCall(node.callee))
  ) {
    return true;
  }

  var keys = Object.keys(node);
  for (var i = 0; i < keys.length; i++) {
    var value = node[keys[i]];
    var children = Array.isArray(value) ? value : [value];
    for (var j = 0; j < children.length; j++) {
      var child = children[j];
      if (child && typeof child.type === 'string' && registersRootComponent(child)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {string} storybookEntrySource - the text of the Storybook entry file
 * @returns {'default'|'old'}
 */
function detectStorybookSetup(storybookEntrySource) {
  var syntaxTree;
  try {
    syntaxTree = getBabelParser().parse(storybookEntrySource, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: ['typescript', 'jsx'],
    });
  } catch (_) {
    return 'old';
  }

  return registersRootComponent(syntaxTree.program) ? 'default' : 'old';
}

module.exports = {
  findStorybookEntry: findStorybookEntry,
  storybookEntryCandidates: storybookEntryCandidates,
  detectStorybookSetup: detectStorybookSetup,
};
