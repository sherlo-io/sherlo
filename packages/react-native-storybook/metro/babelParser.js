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

module.exports = loadBabelParser;
