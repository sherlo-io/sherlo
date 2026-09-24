'use strict';

// ---------------------------------------------------------------------------
// Module Mocking - config-time scan (SHERLO-1734 Phase 2, MK-09)
// ---------------------------------------------------------------------------
//
// A single, self-contained module that answers one question: which module keys
// does the app declare under `parameters.sherlo.mocks`?
//
// It does two things and nothing more:
//   1. findScanFiles(projectRoot)  - locate story files and preview.* files.
//   2. collectMockKeysFromSource() - shallow-parse one file with the Babel
//      parser Metro already ships and return the module keys declared under any
//      `sherlo: { mocks: ... }`, in either form a story may write:
//        - a list of declarations, where each names its module with an import
//          expression: `mock(() => import('some-module'), ...)`,
//        - the older object, whose STRING-LITERAL keys name the modules.
//
// Deliberately narrow: it extracts module KEYS only. It never reads, evaluates,
// or otherwise touches the mock VALUES - those live entirely in the Phase 1
// runtime. Tolerant of TypeScript `as`/`satisfies` annotations wrapped around
// the parameters object (or any node on the way down).

var fs = require('fs');
var path = require('path');

// The Babel parser Metro already depends on. Fall back across the couple of
// module ids it has shipped under so we never take a hard dependency Metro
// itself does not already satisfy.
function getBabelParser() {
  try {
    return require('@babel/parser');
  } catch (_) {
    return require('metro-babel-transformer/node_modules/@babel/parser');
  }
}

// Directories that never contain first-party story/preview sources. Skipping
// them keeps the scan fast and avoids descending into installed packages.
var IGNORED_DIRS = {
  node_modules: true,
  '.git': true,
  '.cache': true,
  dist: true,
  build: true,
  ios: true,
  android: true,
  '.expo': true,
};

var SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

// A file is a scan target when it is a Storybook story (`*.stories.<ext>`) or a
// Storybook preview entry (`preview.<ext>`, e.g. .storybook/preview.tsx).
function isScanTarget(fileName) {
  var ext = path.extname(fileName);
  if (SOURCE_EXTENSIONS.indexOf(ext) === -1) return false;
  var base = fileName.slice(0, -ext.length);
  return base === 'preview' || base.slice(-8) === '.stories';
}

// Recursively collect absolute paths of every story/preview file under
// projectRoot, skipping IGNORED_DIRS. Filesystem errors on a single entry are
// swallowed so one unreadable directory never fails the whole build.
function findScanFiles(projectRoot) {
  var found = [];

  function walk(dir) {
    var entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS[entry.name]) walk(full);
      } else if (entry.isFile() && isScanTarget(entry.name)) {
        found.push(full);
      }
    }
  }

  walk(projectRoot);
  return found;
}

// Strip TypeScript-only expression wrappers so we can see the ObjectExpression
// underneath `x satisfies T`, `x as T`, `<T>x`, `x!`, and `(x)`.
function unwrapExpression(node) {
  while (
    node &&
    (node.type === 'TSAsExpression' ||
      node.type === 'TSSatisfiesExpression' ||
      node.type === 'TSNonNullExpression' ||
      node.type === 'TSTypeAssertion' ||
      node.type === 'ParenthesizedExpression')
  ) {
    node = node.expression;
  }
  return node;
}

// The static name of an object property key, for Identifier and StringLiteral
// keys only. Computed / numeric keys return null.
function propertyName(prop) {
  if (!prop.key) return null;
  if (prop.key.type === 'Identifier' && !prop.computed) return prop.key.name;
  if (prop.key.type === 'StringLiteral') return prop.key.value;
  return null;
}

// Collect the STRING-LITERAL keys of a `mocks: { ... }` object. Identifier,
// numeric, computed, and spread keys are intentionally ignored - module
// specifiers are always string literals, and this keeps the contract simple.
function collectKeysFromMocksObject(mocksObject, out) {
  var props = mocksObject.properties || [];
  for (var i = 0; i < props.length; i++) {
    var prop = props[i];
    if (
      (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') &&
      prop.key &&
      prop.key.type === 'StringLiteral' &&
      !prop.computed
    ) {
      out.add(prop.key.value);
    }
  }
}

// Node fields that hold position and comment metadata rather than child nodes.
var METADATA_FIELDS = {
  loc: true,
  start: true,
  end: true,
  range: true,
  leadingComments: true,
  trailingComments: true,
  innerComments: true,
};

// Call `visit` on every node in the tree, in no particular order.
function walkNodes(node, visit) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) walkNodes(node[i], visit);
    return;
  }

  if (typeof node.type !== 'string') return;

  visit(node);

  for (var field in node) {
    if (METADATA_FIELDS[field]) continue;
    walkNodes(node[field], visit);
  }
}

// The string literal an import expression names, or null when it names anything else. Babel
// parses `import('x')` either as a call whose callee is `Import` or, on newer versions, as an
// `ImportExpression`; both spellings are read here.
function importedSpecifier(node) {
  var specifier = null;
  if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Import') {
    specifier = (node.arguments || [])[0];
  } else if (node.type === 'ImportExpression') {
    specifier = node.source;
  }
  return specifier && specifier.type === 'StringLiteral' ? specifier.value : null;
}

// Collect the module each declaration in a `mocks: [ ... ]` list names. A declaration names
// its module with an import expression - `mock(() => import('some-module'), ...)` - so every
// string literal imported anywhere under the list is a mocked module. An import whose
// specifier is not a string literal names nothing the build can see and is ignored, exactly as
// a computed object key is.
function collectKeysFromMockDeclarations(declarationList, out) {
  walkNodes(declarationList, function (node) {
    var specifier = importedSpecifier(node);
    if (specifier !== null) out.add(specifier);
  });
}

// Harvest the module keys of every `sherlo: { mocks: ... }` in the tree. Runs for the
// preview-, meta- and story-level parameter declarations alike, because it visits the whole
// tree; TS wrappers on any value are unwrapped on the way down.
function walkForMockKeys(ast, out) {
  walkNodes(ast, function (node) {
    if (node.type !== 'ObjectExpression') return;

    var props = node.properties || [];
    for (var p = 0; p < props.length; p++) {
      var prop = props[p];
      if (prop.type !== 'ObjectProperty' || propertyName(prop) !== 'sherlo') continue;

      var sherloObject = unwrapExpression(prop.value);
      if (!sherloObject || sherloObject.type !== 'ObjectExpression') continue;

      var sherloProps = sherloObject.properties || [];
      for (var s = 0; s < sherloProps.length; s++) {
        var sherloProp = sherloProps[s];
        if (sherloProp.type !== 'ObjectProperty' || propertyName(sherloProp) !== 'mocks') continue;

        var mocks = unwrapExpression(sherloProp.value);
        if (!mocks) continue;
        if (mocks.type === 'ObjectExpression') collectKeysFromMocksObject(mocks, out);
        if (mocks.type === 'ArrayExpression') collectKeysFromMockDeclarations(mocks, out);
      }
    }
  });
}

// Parse one file's source and return the distinct module keys it declares. Parse failures are non-fatal: a malformed file simply yields no
// keys rather than breaking the Metro config.
function collectMockKeysFromSource(source) {
  var parser = getBabelParser();
  var ast;
  try {
    ast = parser.parse(source, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: ['typescript', 'jsx'],
    });
  } catch (_) {
    return [];
  }
  var out = new Set();
  walkForMockKeys(ast.program || ast, out);
  return Array.from(out);
}

// Scan every story/preview file under projectRoot and return a Map of
// mockKey -> the first file that declared it (used for FG-01 error messages).
function scanProjectForMockKeys(projectRoot) {
  var keyToFile = new Map();
  var files = findScanFiles(projectRoot);
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch (_) {
      continue;
    }
    var keys = collectMockKeysFromSource(source);
    for (var k = 0; k < keys.length; k++) {
      if (!keyToFile.has(keys[k])) keyToFile.set(keys[k], file);
    }
  }
  return keyToFile;
}

module.exports = {
  findScanFiles: findScanFiles,
  isScanTarget: isScanTarget,
  collectMockKeysFromSource: collectMockKeysFromSource,
  scanProjectForMockKeys: scanProjectForMockKeys,
};
