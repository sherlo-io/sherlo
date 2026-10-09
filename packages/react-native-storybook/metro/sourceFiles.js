'use strict';

var path = require('path');

// The extensions of a source file a project writes its Storybook in. The order is the order a
// Storybook entry file is looked for in (`index.ts` before `index.tsx`).
var SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

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
  basenameWithoutExtension: basenameWithoutExtension,
};
