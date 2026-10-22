'use strict';

// ---------------------------------------------------------------------------
// The module a mock names, as its story wrote it, handed over at transform time
// ---------------------------------------------------------------------------
//
// A declaration `mock(() => import('x'), {...})` learns its module from the stand-in its import
// reaches. When it reaches none - the module was mocked, or even written, after the bundler
// started - the only record left is the bundler's scan, which is as old as the bundler and so
// misses it. Metro transforms a story file again each time it is saved, so the transform is the
// one place that always sees the file as it is now: here each such call is handed the module its
// import names as a third argument (src/mocking/mockDeclaration.ts), and its failure names it.
// Its import becomes a require of the bundle, so no split-bundle loader stands between a story
// and the module it mocks (requiredLater).
//
// The transformer is Sherlo's in place of the project's own, which it hands every file to. It
// changes only story and preview files and the app's files that name the SDK, only their `mock` calls, and never what a mock serves.

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var mockScan = require('./mockScan');
var projectRootOf = require('./projectPaths').projectRootOf;
var projectTransformerFile = require('./projectPaths').projectTransformerFile;
var sherloCacheFolder = require('./projectPaths').sherloCacheFolder;

// This file as the generated transformer requires it: beside the published bundle in dist-metro,
// or this very source when the SDK runs unbuilt.
var THIS_FILE = path.join(__dirname, 'mockSpecifierTransformer.js');

/**
 * `source` with each `mock(() => import('x'), definition)` call given `'x'` as a third argument,
 * and its import made a require of the bundle (requiredLater). A file that may declare no mock
 * (mockScan.mayDeclareMocks), a call with other than two arguments, and a file that does not
 * parse are left as they are. Only the call's own lines change, so every other line of the file
 * stays where it was.
 *
 * @param {string} filename - the file's path, as Metro hands it to the transformer
 * @param {string} source - the file's source
 * @returns {string}
 */
function markMockSpecifiers(filename, source) {
  if (!mockScan.mayDeclareMocks(filename, source)) return source;
  if (source.indexOf('mock') === -1 || !/\bimport\s*\(/.test(source)) return source;

  var ast = mockScan.parseScanTarget(source);
  if (!ast) return source;

  var edits = [];
  mockScan.walkNodes(ast.program || ast, function (node) {
    if (node.type !== 'CallExpression' || !mockScan.isMockCallee(node.callee)) return;
    if (node.arguments.length !== 2) return;

    var specifier = mockScan.soleImportedSpecifier(node.arguments[0]);
    if (specifier === null) return;
    mockScan.walkNodes(node.arguments[0].body, function (inner) {
      if (mockScan.importedSpecifier(inner) === null) return;
      edits.push({
        from: inner.start,
        to: inner.end,
        text: requiredLater(specifier, source.slice(inner.start, inner.end)),
      });
    });
    var end = node.arguments[1].end;
    edits.push({ from: end, to: end, text: ', ' + JSON.stringify(specifier) });
  });

  edits.sort(function (first, second) {
    return second.from - first.from;
  });
  return edits.reduce(function (marked, edit) {
    return marked.slice(0, edit.from) + edit.text + marked.slice(edit.to);
  }, source);
}

/**
 * The text an `import('x')` in a mock becomes: the same promise, from the bundle's own require.
 * In a lazy dev bundle an import() is a split bundle the project's loader fetches, and Expo's
 * loader on a bundler started with `react-native start` rejects after loading it ("Expected
 * HMRClient.setup() call at startup."): the mock would learn no module. The require is still
 * made only when the mock asks, so a module that throws as it loads still rejects. The import's
 * line breaks are kept, so every later line of the file stays where it was.
 *
 * @param {string} specifier - the module the import names
 * @param {string} importText - the import expression as written
 * @returns {string}
 */
function requiredLater(specifier, importText) {
  return (
    'Promise.resolve().then(function () { return require(' +
    JSON.stringify(specifier) +
    '); })' +
    importText.replace(/[^\n]/g, '')
  );
}

/**
 * The source of the transformer Metro is handed: the project's own, with story files marked first.
 * Its cache key carries a hash of this file, so a new SDK never serves a story transformed by an
 * old one.
 *
 * @param {string} projectTransformer - the project's own babelTransformerPath
 * @returns {string}
 */
function mockSpecifierTransformerSource(projectTransformer) {
  var markerHash = crypto.createHash('sha256').update(fs.readFileSync(THIS_FILE)).digest('hex');
  return (
    "'use strict';\n" +
    "// Generated by Sherlo's withStorybook: hands each story file's mocks the module they import,\n" +
    "// as the file wrote it. Every file then goes to the project's own transformer.\n" +
    'var projectTransformer = require(' +
    JSON.stringify(projectTransformer) +
    ');\n' +
    'var markMockSpecifiers = require(' +
    JSON.stringify(THIS_FILE) +
    ').markMockSpecifiers;\n' +
    'var MARKER_HASH = ' +
    JSON.stringify(markerHash) +
    ';\n' +
    '\n' +
    'module.exports = Object.assign({}, projectTransformer, {\n' +
    '  transform: function (args) {\n' +
    '    var src = markMockSpecifiers(args.filename, args.src);\n' +
    '    return projectTransformer.transform(Object.assign({}, args, { src: src }));\n' +
    '  },\n' +
    '  getCacheKey: function () {\n' +
    "    var projectKey = typeof projectTransformer.getCacheKey === 'function'\n" +
    '      ? projectTransformer.getCacheKey.apply(projectTransformer, arguments)\n' +
    "      : '';\n" +
    "    return projectKey + ':sherlo-mock-specifiers:' + MARKER_HASH;\n" +
    '  },\n' +
    '});\n'
  );
}

/**
 * Writes Sherlo's story transformer into the project's Sherlo cache folder, over the transformer
 * `config` names, and returns its path for `transformer.babelTransformerPath`.
 *
 * @param {object} config - a Metro config
 * @returns {string}
 */
function writeMockSpecifierTransformer(config) {
  var cacheDir = sherloCacheFolder(projectRootOf(config));
  fs.mkdirSync(cacheDir, { recursive: true });
  var transformerPath = path.join(cacheDir, 'mock-specifier-transformer.js');
  var projectTransformer = projectTransformerFile(config);
  // A config already wrapped once keeps the transformer it has, never one handing files to itself.
  if (projectTransformer === transformerPath) return transformerPath;

  fs.writeFileSync(transformerPath, mockSpecifierTransformerSource(projectTransformer), 'utf8');
  return transformerPath;
}

module.exports = {
  markMockSpecifiers: markMockSpecifiers,
  writeMockSpecifierTransformer: writeMockSpecifierTransformer,
};
