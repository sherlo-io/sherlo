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

// `source` with each edit's range, from `start` to `end` of the source as it was, replaced by its
// `text`; an insertion is an empty range. The ranges must not overlap. Edits are applied from the
// end of the source back, so each range still names the text it named in the source as it was.
function sourceWithEdits(source, edits) {
  var fromTheEnd = edits.slice().sort(function (first, second) {
    return second.start - first.start;
  });
  return fromTheEnd.reduce(function (edited, edit) {
    return edited.slice(0, edit.start) + edit.text + edited.slice(edit.end);
  }, source);
}

module.exports = loadBabelParser;
module.exports.parsedOrNull = parsedOrNull;
module.exports.sourceWithEdits = sourceWithEdits;
