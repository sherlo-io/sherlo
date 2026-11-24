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
//
// The transformer is Sherlo's in place of the project's own, which it hands every file to. It
// changes only files that may declare mocks, only their `mock` calls, and never what a mock
// serves - and the few files of React Native and Expo that reach native code, where it lays in
// the roads of the recorder of a test run (markNativeRoads below).

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
 * `source` with each `mock(() => import('x'), definition)` call given `'x'` as a third argument.
 * A file that may declare no mock (mockScan.mayDeclareMocks), a call with other than two
 * arguments, and a file that does not parse are left as they are. Text is only inserted, on the
 * call's own line, so every other position in the file stays where it was.
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

  var insertions = [];
  mockScan.walkNodes(ast.program || ast, function (node) {
    if (node.type !== 'CallExpression' || !mockScan.isMockCallee(node.callee)) return;
    if (node.arguments.length !== 2) return;

    var specifier = mockScan.soleImportedSpecifier(node.arguments[0]);
    if (specifier === null) return;
    insertions.push({ at: node.arguments[1].end, text: ', ' + JSON.stringify(specifier) });
  });

  insertions.sort(function (first, second) {
    return second.at - first.at;
  });
  return insertions.reduce(function (marked, insertion) {
    return marked.slice(0, insertion.at) + insertion.text + marked.slice(insertion.at);
  }, source);
}

// The file that hands React Native's table of native modules to the JavaScript, which native code
// installs read-only, and the one every module native code may call into is registered through
// (every device event goes out that way). A release bundle names no module by its path, so each is
// ended with one line that hands its module to the polyfill's recorder (metro/polyfill.js,
// global.__sherloNativeRoad) as it finishes running. The line does nothing where there is no
// recorder: outside a test run and on the old architecture.
var NATIVE_ROAD_FILES = [
  'react-native/Libraries/BatchedBridge/NativeModules.js',
  'react-native/Libraries/Core/registerCallableModule.js',
];

// The Fabric renderers take native code's two entries on lines of their own as they load: the
// commit of the tree and the registration of their event entry. Each line is rewritten in place to
// take the polyfill's wrapper instead (global.__sherloCommitRoad, global.__sherloViewEventRoad), so
// every commit and every event a view sends is seen before it goes on. Fabric's UI manager itself is
// never wrapped: native code reads it back as its own on every event. A renderer whose line is not
// found is left as it is, and the recorder marks the story blind.
var RENDERER_FILES = [
  'react-native/Libraries/Renderer/implementations/ReactFabric-prod.js',
  'react-native/Libraries/Renderer/implementations/ReactFabric-profiling.js',
  'react-native/Libraries/Renderer/implementations/ReactFabric-dev.js',
];
var RENDERER_LINES = [
  {
    line: 'completeRoot = _nativeFabricUIManage.completeRoot,',
    rewritten:
      "completeRoot = typeof global.__sherloCommitRoad === 'function' ? " +
      'global.__sherloCommitRoad(_nativeFabricUIManage.completeRoot) : ' +
      '_nativeFabricUIManage.completeRoot,',
  },
  {
    line: 'registerEventHandler && registerEventHandler(dispatchEvent);',
    rewritten:
      'registerEventHandler && registerEventHandler(' +
      "typeof global.__sherloViewEventRoad === 'function' ? " +
      'global.__sherloViewEventRoad(dispatchEvent) : dispatchEvent);',
  },
];

/**
 * `source` with the recorder's roads laid in when `filename` reaches native code: one line added at
 * the end of a file of NATIVE_ROAD_FILES, and RENDERER_LINES rewritten in a renderer. Every other
 * file is as it is. Text is only added at the end or changed within its own line, so every other
 * position in the file stays where it was.
 *
 * @param {string} filename - the file's path, as Metro hands it to the transformer
 * @param {string} source - the file's source
 * @returns {string}
 */
function markNativeRoads(filename, source) {
  var slashed = filename.split(path.sep).join('/');
  var isFile = function (candidate) {
    return slashed === candidate || slashed.endsWith('/' + candidate);
  };
  if (RENDERER_FILES.some(isFile)) {
    return RENDERER_LINES.reduce(function (marked, rendererLine) {
      return marked.replace(rendererLine.line, rendererLine.rewritten);
    }, source);
  }
  var road = NATIVE_ROAD_FILES.find(isFile);
  if (!road) return source;
  return (
    source +
    "\n;if (typeof global.__sherloNativeRoad === 'function') global.__sherloNativeRoad(" +
    JSON.stringify(road) +
    ', module);\n'
  );
}

/**
 * The source of the transformer Metro is handed: the project's own, with story files and the files
 * that reach native code marked first.
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
    "// as the file wrote it, and lays the test run recorder's roads into the files that reach native\n" +
    "// code. Every file then goes to the project's own transformer.\n" +
    'var projectTransformer = require(' +
    JSON.stringify(projectTransformer) +
    ');\n' +
    'var markMockSpecifiers = require(' +
    JSON.stringify(THIS_FILE) +
    ').markMockSpecifiers;\n' +
    'var markNativeRoads = require(' +
    JSON.stringify(THIS_FILE) +
    ').markNativeRoads;\n' +
    'var MARKER_HASH = ' +
    JSON.stringify(markerHash) +
    ';\n' +
    '\n' +
    'module.exports = Object.assign({}, projectTransformer, {\n' +
    '  transform: function (args) {\n' +
    '    var src = markNativeRoads(args.filename, markMockSpecifiers(args.filename, args.src));\n' +
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
  markNativeRoads: markNativeRoads,
  writeMockSpecifierTransformer: writeMockSpecifierTransformer,
};
