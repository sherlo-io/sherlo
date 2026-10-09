'use strict';

var fs = require('fs');
var path = require('path');

// The extensions of a source file a project writes its app or its Storybook in, TypeScript first:
// the order a Storybook entry file is looked for in (`index.ts` before `index.tsx`).
var SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function isJavaScriptExtension(extension) {
  return extension === '.js' || extension === '.jsx';
}

// The same extensions, JavaScript first: the order Storybook's own entry swap looks for an app
// entry in (`index.js` first).
var SOURCE_EXTENSIONS_JAVASCRIPT_FIRST = SOURCE_EXTENSIONS.filter(isJavaScriptExtension).concat(
  SOURCE_EXTENSIONS.filter(function (extension) {
    return !isJavaScriptExtension(extension);
  })
);

/**
 * `basePath` with each source extension added, in the order asked for.
 *
 * @param {string} basePath - a path without an extension, such as `/project/index`
 * @param {'typescript-first'|'javascript-first'} order
 * @returns {string[]}
 */
function sourceFileCandidates(basePath, order) {
  var extensions =
    order === 'javascript-first' ? SOURCE_EXTENSIONS_JAVASCRIPT_FIRST : SOURCE_EXTENSIONS;
  return extensions.map(function (extension) {
    return basePath + extension;
  });
}

// Whether `filePath` is a file on disk (not a folder, not missing).
function isExistingFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

/**
 * The first of `basePath` with a source extension that is a file on disk, in the order asked for.
 *
 * @param {string} basePath - a path without an extension, such as `/project/index`
 * @param {'typescript-first'|'javascript-first'} order
 * @returns {string|null} the path as found, or null when there is none
 */
function firstExistingSourceFile(basePath, order) {
  var candidates = sourceFileCandidates(basePath, order);
  for (var i = 0; i < candidates.length; i++) {
    if (isExistingFile(candidates[i])) return candidates[i];
  }
  return null;
}

// `storybook.requires.ts` -> `storybook.requires`
function basenameWithoutExtension(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

// `.rnstorybook/preview.ts` - the Storybook preview entry, in any extension
function isPreviewFile(filePath) {
  return basenameWithoutExtension(filePath) === 'preview';
}

module.exports = {
  isPreviewFile: isPreviewFile,
  SOURCE_EXTENSIONS: SOURCE_EXTENSIONS,
  isExistingFile: isExistingFile,
  sourceFileCandidates: sourceFileCandidates,
  firstExistingSourceFile: firstExistingSourceFile,
  basenameWithoutExtension: basenameWithoutExtension,
};
