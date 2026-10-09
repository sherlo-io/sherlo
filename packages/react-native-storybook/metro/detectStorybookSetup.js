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
var DEFAULT_CONFIG_DIRNAMES = require('./ensureStorybookRequires').DEFAULT_CONFIG_DIRNAMES;

var ENTRY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// The Babel parser Metro already depends on, resolved the way mockScan.js and storyTitleReader.js
// resolve it.
function getBabelParser() {
  try {
    return require('@babel/parser');
  } catch (_) {
    return require('metro-babel-transformer/node_modules/@babel/parser');
  }
}

function findFirstExistingEntry(configDirectory) {
  for (var i = 0; i < ENTRY_EXTENSIONS.length; i++) {
    var entryPath = path.join(configDirectory, 'index' + ENTRY_EXTENSIONS[i]);
    if (fs.existsSync(entryPath)) return entryPath;
  }
  return null;
}

/**
 * @param {string} projectRoot - absolute path to the project
 * @param {string} [configPath] - the Storybook config folder, relative to projectRoot or absolute;
 *   when omitted, the first default folder that exists
 * @returns {string|null} absolute path to the Storybook entry file, or null when there is none
 */
function findStorybookEntry(projectRoot, configPath) {
  if (configPath) {
    return findFirstExistingEntry(path.resolve(projectRoot, configPath));
  }

  for (var i = 0; i < DEFAULT_CONFIG_DIRNAMES.length; i++) {
    var entryPath = findFirstExistingEntry(path.resolve(projectRoot, DEFAULT_CONFIG_DIRNAMES[i]));
    if (entryPath) return entryPath;
  }
  return null;
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
  detectStorybookSetup: detectStorybookSetup,
};
