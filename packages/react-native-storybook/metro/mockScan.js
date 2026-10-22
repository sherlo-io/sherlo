'use strict';

// ---------------------------------------------------------------------------
// Module Mocking - config-time scan (SHERLO-1734 Phase 2, MK-09)
// ---------------------------------------------------------------------------
//
// A single, self-contained module that answers one question: which module keys
// does the app declare under `parameters.sherlo.mocks`?
//
// It does two things and nothing more:
//   1. findScanFiles(projectRoot)     - locate story files, preview.* files, and every other
//      file of the app's own that names the SDK: a story may import its list of mocks from
//      one (`mocks: signedInFakes`), and the list's `mock(...)` calls sit there.
//   2. collectMockEntriesFromSource() - shallow-parse one file with the Babel
//      parser Metro already ships and return the module keys it declares:
//        - each `mock(() => import('some-module'), ...)` call, wherever it sits in the file,
//        - and under any `sherlo: { mocks: ... }`, the older object's STRING-LITERAL keys.
//
// Deliberately narrow: it extracts module KEYS only. It never reads, evaluates,
// or otherwise touches the mock VALUES - those live entirely in the Phase 1
// runtime. Tolerant of TypeScript `as`/`satisfies` annotations wrapped around
// the parameters object (or any node on the way down).

var fs = require('fs');
var path = require('path');

var getBabelParser = require('./babelParser');
var sourceFiles = require('./sourceFiles');
var SOURCE_EXTENSIONS = sourceFiles.SOURCE_EXTENSIONS;
var basenameWithoutExtension = sourceFiles.basenameWithoutExtension;
var isPreviewFile = sourceFiles.isPreviewFile;

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

// The package a file imports `mock` from.
var SDK_PACKAGE = '@sherlo/react-native-storybook';

// A file is a scan target when it is a Storybook story (`*.stories.<ext>`) or a
// Storybook preview entry (`preview.<ext>`, e.g. .storybook/preview.tsx).
function isScanTarget(fileName) {
  var ext = path.extname(fileName);
  if (SOURCE_EXTENSIONS.indexOf(ext) === -1) return false;
  return isPreviewFile(fileName) || basenameWithoutExtension(fileName).slice(-8) === '.stories';
}

// Whether the file at `filePath`, whose text is `source`, may declare mocks: a story or preview
// file, or any other source file of the app's own that names the SDK - a story may import its
// list of mocks from such a file. A file inside node_modules is never the app's declaration.
function mayDeclareMocks(filePath, source) {
  if (/(^|[\\/])node_modules[\\/]/.test(filePath)) return false;
  var fileName = path.basename(filePath);
  if (isScanTarget(fileName)) return true;
  if (SOURCE_EXTENSIONS.indexOf(path.extname(fileName)) === -1) return false;
  // Many app files name the SDK for other reasons (isStorybookMode); only one that also calls
  // `mock` with an import expression is worth a parse.
  return (
    source.indexOf(SDK_PACKAGE) !== -1 && /\bmock\s*\(/.test(source) && /\bimport\s*\(/.test(source)
  );
}

// Whether the source file at `filePath` may declare mocks; an unreadable file declares none.
function fileMayDeclareMocks(filePath) {
  // A story or preview file's name decides alone, so it is not read twice.
  if (isScanTarget(path.basename(filePath))) return mayDeclareMocks(filePath, '');
  if (SOURCE_EXTENSIONS.indexOf(path.extname(filePath)) === -1) return false;
  try {
    return mayDeclareMocks(filePath, fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return false;
  }
}

// Recursively collect absolute paths of every file under projectRoot that may declare mocks
// (mayDeclareMocks), skipping IGNORED_DIRS. Filesystem errors on a single entry are
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
      } else if (entry.isFile() && fileMayDeclareMocks(full)) {
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
function collectKeysFromMocksObject(mocksObject, addMockKey) {
  var props = mocksObject.properties || [];
  for (var i = 0; i < props.length; i++) {
    var prop = props[i];
    if (
      (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') &&
      prop.key &&
      prop.key.type === 'StringLiteral' &&
      !prop.computed
    ) {
      addMockKey(prop.key.value, false);
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
function collectKeysFromMockDeclarations(declarationList, addMockKey) {
  walkNodes(declarationList, function (node) {
    var specifier = importedSpecifier(node);
    if (specifier !== null) addMockKey(specifier, true);
  });
}

// Whether `callee` is the SDK's `mock`, called by name or off a namespace (`Sherlo.mock`).
function isMockCallee(callee) {
  if (!callee) return false;
  if (callee.type === 'Identifier') return callee.name === 'mock';
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'mock'
  );
}

// The one module the function `importModule` imports, or null when it imports none or several.
function soleImportedSpecifier(importModule) {
  if (
    !importModule ||
    (importModule.type !== 'ArrowFunctionExpression' && importModule.type !== 'FunctionExpression')
  ) {
    return null;
  }
  var specifiers = new Set();
  walkNodes(importModule.body, function (node) {
    var specifier = importedSpecifier(node);
    if (specifier !== null) specifiers.add(specifier);
  });
  return specifiers.size === 1 ? Array.from(specifiers)[0] : null;
}

// Collect the module of every `mock(() => import('some-module'), ...)` call in the tree, wherever
// it sits: a story may build its list in another file and import it (`mocks: signedInFakes`),
// where no `sherlo: { mocks: [...] }` surrounds the calls.
function collectKeysFromMockCalls(ast, addMockKey) {
  walkNodes(ast, function (node) {
    if (node.type !== 'CallExpression' || !isMockCallee(node.callee)) return;
    var specifier = soleImportedSpecifier((node.arguments || [])[0]);
    if (specifier !== null) addMockKey(specifier, true);
  });
}

// Harvest the module keys of every `sherlo: { mocks: ... }` in the tree. Runs for the
// preview-, meta- and story-level parameter declarations alike, because it visits the whole
// tree; TS wrappers on any value are unwrapped on the way down.
function walkForMockKeys(ast, addMockKey) {
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
        if (mocks.type === 'ObjectExpression') collectKeysFromMocksObject(mocks, addMockKey);
        if (mocks.type === 'ArrayExpression') collectKeysFromMockDeclarations(mocks, addMockKey);
      }
    }
  });
}

// The syntax tree of a story or preview file's source, or null when it cannot be parsed. The
// parse is shallow: TypeScript and JSX are read, nothing is evaluated.
function parseScanTarget(source) {
  try {
    return getBabelParser().parse(source, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: ['typescript', 'jsx'],
    });
  } catch (_) {
    return null;
  }
}

// Parse one file's source and return the distinct modules it declares a mock for: each as
// its key and whether an import expression named it. The two forms name a module differently,
// so they are read differently later - an import expression is written relative to the file it
// sits in, exactly like that file's own imports, while a string key is written from the
// project root. Parse failures are non-fatal: a malformed file simply yields nothing rather
// than breaking the Metro config.
function collectMockEntriesFromSource(source) {
  var ast = parseScanTarget(source);
  if (!ast) return [];

  var namedByImport = new Map();
  function addMockKey(key, fromImportExpression) {
    // A story that writes a string key looks its mock up by that same string at runtime, so
    // when one file names the same module both ways, the string form is the one that decides.
    if (!namedByImport.has(key) || !fromImportExpression) {
      namedByImport.set(key, fromImportExpression);
    }
  }
  walkForMockKeys(ast.program || ast, addMockKey);
  collectKeysFromMockCalls(ast.program || ast, addMockKey);

  var entries = [];
  namedByImport.forEach(function (fromImportExpression, key) {
    entries.push({ key: key, namedByImport: fromImportExpression });
  });
  return entries;
}

// Scan every story/preview file under projectRoot and return one entry per mock declared:
// its key, the file that declared it (used for the FG-01 warning, and to find a relative key's
// module beside that file), and which form named it.
function scanProjectForMocks(projectRoot) {
  var declaredMocks = [];
  var files = findScanFiles(projectRoot);
  for (var i = 0; i < files.length; i++) {
    declaredMocks = declaredMocks.concat(scanFileForMocks(files[i]));
  }
  return declaredMocks;
}

// The mocks one file declares, or nothing when the file cannot be read.
function scanFileForMocks(file) {
  var source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return [];
  }
  return collectMockEntriesFromSource(source).map(function (entry) {
    return { key: entry.key, file: file, namedByImport: entry.namedByImport };
  });
}

module.exports = {
  findScanFiles: findScanFiles,
  mayDeclareMocks: mayDeclareMocks,
  parseScanTarget: parseScanTarget,
  walkNodes: walkNodes,
  isMockCallee: isMockCallee,
  importedSpecifier: importedSpecifier,
  soleImportedSpecifier: soleImportedSpecifier,
  collectMockEntriesFromSource: collectMockEntriesFromSource,
  scanFileForMocks: scanFileForMocks,
  scanProjectForMocks: scanProjectForMocks,
};
