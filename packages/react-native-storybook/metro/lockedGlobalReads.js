'use strict';

// ---------------------------------------------------------------------------
// The app's reads of a global's members, routed through the recorder at transform time
// ---------------------------------------------------------------------------
//
// A native side may lay a global the app cannot replace: the recorder of a test run can neither
// swap it for a stand-in nor sit in front of it, so what the app reads below it goes unseen. The
// one place such a read can still be met is the app's own code, where it names the global: each
// read of a member of the global object written as `globalThis.<name>` or `global.<name>` (with
// optional chaining, or a string key) is routed through the recorder's read
// (__sherloGlobalRead, metro/polyfill.js). The recorder hands back the member as it is, except
// a global it noted as one it cannot replace, which it hands back as its stand-in, so every read
// below it is recorded. The recorder's read is reached only as a member of the global object the
// read already names, never by a name of its own: code a compiler moves to another JS runtime
// then takes nothing new with it. Where there is no recorder (outside a test run, in the quick
// check's replay, on another runtime) the read runs as it was written. A write, a delete and a
// call of the member itself are left as written, as is a read written any other way, or by a name
// the file binds as its own: it stays unrecorded.

var mockScan = require('./mockScan');
var babelParser = require('./babelParser');

var parsedOrNull = babelParser.parsedOrNull;
var sourceWithEdits = babelParser.sourceWithEdits;

var GLOBAL_OBJECT_NAMES = { global: true, globalThis: true };
var READ_FUNCTION = '__sherloGlobalRead';
var MAY_READ_A_GLOBAL = /\bglobal(?:This)?\s*(?:\?\.|\.|\[)/;
var SCRIPT_FILE = /\.(?:[cm]?js|jsx|tsx?)$/;

function parsedScriptOrNull(filename, source) {
  var plugins = /\.tsx?$/.test(filename) ? ['typescript'] : ['flow'];
  if (!/\.ts$/.test(filename)) plugins.push('jsx');
  return parsedOrNull(source, { sourceType: 'unambiguous', plugins: plugins });
}

// Each name `pattern` binds: an identifier, or every one a destructuring, a default or a rest
// takes in.
function addNamesBound(pattern, names) {
  if (!pattern) return;
  switch (pattern.type) {
    case 'Identifier':
      names.add(pattern.name);
      return;
    case 'ObjectPattern':
      pattern.properties.forEach(function (property) {
        addNamesBound(property.type === 'RestElement' ? property : property.value, names);
      });
      return;
    case 'ArrayPattern':
      pattern.elements.forEach(function (element) {
        addNamesBound(element, names);
      });
      return;
    case 'AssignmentPattern':
      addNamesBound(pattern.left, names);
      return;
    case 'RestElement':
      addNamesBound(pattern.argument, names);
      return;
    default:
      return;
  }
}

// Each name the file binds as its own anywhere: a variable, a parameter, a function or a class,
// an import, or a caught error.
function namesBoundInFile(ast) {
  var names = new Set();
  var addAll = function (patterns) {
    patterns.forEach(function (pattern) {
      addNamesBound(pattern, names);
    });
  };
  mockScan.walkNodes(ast.program, function (node) {
    if (node.type === 'VariableDeclarator') addNamesBound(node.id, names);
    if (node.type === 'CatchClause') addNamesBound(node.param, names);
    if (/Function|Class/.test(node.type)) addNamesBound(node.id, names);
    if (node.params) addAll(node.params);
    if (/^Import\w*Specifier$/.test(node.type)) addNamesBound(node.local, names);
  });
  return names;
}

// The member's name when `node` reads a member of the global object by a fixed name, else null.
// In a file that binds the global object's name as its own (`boundNames`), a read by that name
// may be of its own, so none is taken as a read of the global object.
function globalMemberName(node, boundNames) {
  if (node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression') return null;
  if (node.object.type !== 'Identifier' || !GLOBAL_OBJECT_NAMES[node.object.name]) return null;
  if (boundNames.has(node.object.name)) return null;
  var name = null;
  if (!node.computed && node.property.type === 'Identifier') name = node.property.name;
  if (node.computed && node.property.type === 'StringLiteral') name = node.property.value;
  if (name === null || name.indexOf('__sherlo') === 0) return null;
  return name;
}

// Each node in a place a read cannot be routed through a function: written to, deleted, called
// as a method (its `this` is the global object), or the start of a chain that goes on past it
// without `?.` (`global?.name.more`), which a nullish global would end as a whole.
function placesNotRouted(ast) {
  var places = new Set();
  // A wrapper that only types what it wraps leaves the wrapped node in its place.
  var mark = function (node) {
    places.add(mockScan.unwrapExpression(node));
  };
  mockScan.walkNodes(ast.program, function (node) {
    switch (node.type) {
      case 'AssignmentExpression':
      case 'AssignmentPattern':
      case 'ForInStatement':
      case 'ForOfStatement':
        return mark(node.left);
      case 'UpdateExpression':
      case 'RestElement':
        return mark(node.argument);
      case 'UnaryExpression':
        return node.operator === 'delete' && mark(node.argument);
      case 'CallExpression':
      case 'OptionalCallExpression':
        return mark(node.callee);
      case 'TaggedTemplateExpression':
        return mark(node.tag);
      case 'ArrayPattern':
        return node.elements.forEach(mark);
      case 'ObjectPattern':
        // A rest among the properties is marked by its own case.
        return node.properties.forEach(function (property) {
          if (property.type === 'ObjectProperty') mark(property.value);
        });
      case 'OptionalMemberExpression':
        if (!node.optional && node.object.optional) places.add(node.object);
        return undefined;
      default:
        return undefined;
    }
  });
  return places;
}

/**
 * `source` with each read of a member of the global object, by a fixed name, routed through the
 * recorder's read when there is one. A file that names no such read, that is not a script, or that
 * does not parse is returned as it is. Each read is replaced within its own line, so every other
 * line of the file stays where it was.
 *
 * @param {string} filename - the file's path, as Metro hands it to the transformer
 * @param {string} source - the file's source
 * @returns {string}
 */
function routeGlobalReads(filename, source) {
  if (!SCRIPT_FILE.test(filename) || !MAY_READ_A_GLOBAL.test(source)) return source;
  var ast = parsedScriptOrNull(filename, source);
  if (!ast) return source;

  var notRouted = placesNotRouted(ast);
  var boundNames = namesBoundInFile(ast);
  var statementStarts = new Set();
  var reads = [];
  mockScan.walkNodes(ast.program, function (node) {
    if (node.type === 'ExpressionStatement') statementStarts.add(node.start);
    var name = globalMemberName(node, boundNames);
    if (name === null || notRouted.has(node)) return;
    reads.push({ node: node, name: name });
  });

  var routedReads = reads.map(function (read) {
    var node = read.node;
    var object = node.object.name;
    var reader = object + '.' + READ_FUNCTION;
    var text =
      '(' +
      object +
      ' != null && typeof ' +
      reader +
      " === 'function' ? " +
      reader +
      '(' +
      object +
      ', ' +
      JSON.stringify(read.name) +
      ') : ' +
      source.slice(node.start, node.end) +
      ')';
    // A statement that began with the read must not begin with a parenthesis: the line before
    // could take it as a call.
    if (statementStarts.has(node.start)) text = 'void 0, ' + text;
    return { start: node.start, end: node.end, text: text };
  });
  return sourceWithEdits(source, routedReads);
}

module.exports = { routeGlobalReads: routeGlobalReads };
