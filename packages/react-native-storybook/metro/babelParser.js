'use strict';

// The Babel parser Metro already depends on, so the SDK takes no dependency Metro does not already
// satisfy. It is the project's own `@babel/parser` when there is one, else the copy that
// metro-babel-transformer carries inside its own node_modules.
function loadBabelParser() {
  try {
    return require('@babel/parser');
  } catch (_) {
    return require('metro-babel-transformer/node_modules/@babel/parser');
  }
}

// The syntax tree of `source` parsed with `options`, or null when it cannot be parsed. The parse
// is shallow: nothing is evaluated.
function parsedOrNull(source, options) {
  try {
    return loadBabelParser().parse(source, options);
  } catch (_) {
    return null;
  }
}

module.exports = loadBabelParser;
module.exports.parsedOrNull = parsedOrNull;
