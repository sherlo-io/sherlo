'use strict';

// ---------------------------------------------------------------------------
// A scene's `given` list, evaluated while the bundle is made
// ---------------------------------------------------------------------------
//
// The phone is set before the app starts, so a scene's phone settings (permissions, location and
// the member) must be known before anything of the app runs. The `given` list is therefore
// evaluated here, from the source, as a small interpreter: it follows the functions the team wrote
// in the scene file and in the relative files it imports, and it knows the SDK's own `given`,
// `signedOut` and `freshInstall`. Everything else (a fake, a request fake, a start state, a call
// into a package) is opaque: it carries no phone setting, so it adds none. Only a phone setting
// that cannot be worked out is refused, naming the file and the scene.

var fs = require('fs');
var path = require('path');

var mockScan = require('./mockScan');
var sourceFiles = require('./sourceFiles');

// What the interpreter cannot work out: it carries no phone setting.
var OPAQUE = { opaque: true };
var DEPTH_LIMIT = 40;

var MEMBERS = { signedOut: 'signed-out', freshInstall: 'fresh-install' };

// What the reading in progress works on: the scene file and the scene a refusal names, and the
// files it followed, so a change to one of them reads the scene again.
var reading = { fileName: '', where: '', files: [] };

function refuse(reason) {
  throw new Error('Scene file ' + reading.fileName + ': ' + reason + ' (' + reading.where + ').');
}

// The static name of an object property key; null for a computed or numeric key.
function keyName(prop) {
  if (!prop.key || prop.computed) return null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'StringLiteral') return prop.key.value;
  return null;
}

// The parsed module at `filePath`, with its top-level bindings: declared constants and functions
// by name, imports by the name they bring in, and the default export.
var modules = {};
function moduleAt(filePath, source) {
  var text = source;
  if (text === undefined) {
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      // A file that cannot be read is a module the interpreter knows nothing of.
      return null;
    }
  }
  var cached = modules[filePath];
  if (cached && cached.text === text) return cached;

  var ast = mockScan.parseScanTarget(text);
  if (!ast) return null;
  var record = { text: text, filePath: filePath, bindings: {}, exports: {}, values: {} };
  (ast.program || ast).body.forEach(function (statement) {
    noteStatement(record, statement);
  });
  modules[filePath] = record;
  return record;
}

function noteDeclaration(record, declaration, exported) {
  if (!declaration) return;
  if (declaration.type === 'VariableDeclaration') {
    declaration.declarations.forEach(function (declarator) {
      if (declarator.id.type !== 'Identifier' || !declarator.init) return;
      record.bindings[declarator.id.name] = { init: declarator.init };
      if (exported) record.exports[declarator.id.name] = declarator.id.name;
    });
  } else if (declaration.type === 'FunctionDeclaration' && declaration.id) {
    record.bindings[declaration.id.name] = { init: declaration };
    if (exported) record.exports[declaration.id.name] = declaration.id.name;
  }
}

function noteStatement(record, statement) {
  if (statement.type === 'ImportDeclaration') {
    statement.specifiers.forEach(function (specifier) {
      var imported =
        specifier.type === 'ImportDefaultSpecifier'
          ? 'default'
          : specifier.type === 'ImportSpecifier'
            ? specifier.imported.name || specifier.imported.value
            : null;
      record.bindings[specifier.local.name] = { from: statement.source.value, imported: imported };
    });
  } else if (statement.type === 'ExportNamedDeclaration') {
    noteDeclaration(record, statement.declaration, true);
    (statement.specifiers || []).forEach(function (specifier) {
      if (statement.source) return;
      record.exports[specifier.exported.name || specifier.exported.value] = specifier.local.name;
    });
  } else if (statement.type === 'ExportDefaultDeclaration') {
    var declaration = statement.declaration;
    if (declaration.type === 'Identifier') {
      record.exports['default'] = declaration.name;
    } else {
      record.bindings['default'] = { init: declaration };
      record.exports['default'] = 'default';
    }
  } else {
    noteDeclaration(record, statement, false);
  }
}

// The file a relative import names, or null for a package (or a file that is not there).
function fileOfImport(from, specifier) {
  if (specifier.charAt(0) !== '.') return null;
  var base = path.resolve(path.dirname(from), specifier);
  if (sourceFiles.isExistingFile(base)) return base;
  return (
    sourceFiles.firstExistingSourceFile(base, 'typescript-first') ||
    sourceFiles.firstExistingSourceFile(path.join(base, 'index'), 'typescript-first')
  );
}

// What the name `name` stands for in `scope` (`{ module, locals }`): a local, a top-level binding of
// the module, or an import. A package import is a marker with its name, for the SDK's own helpers.
function lookUp(name, scope, depth) {
  if (Object.prototype.hasOwnProperty.call(scope.locals, name)) return scope.locals[name];
  var binding = scope.module.bindings[name];
  if (!binding) return name === 'undefined' ? undefined : OPAQUE;
  if (binding.init) {
    if (!Object.prototype.hasOwnProperty.call(scope.module.values, name)) {
      scope.module.values[name] = OPAQUE;
      var value = evaluate(binding.init, { module: scope.module, locals: {} }, depth + 1);
      if (value && value.node && !value.name) value.name = name;
      scope.module.values[name] = value;
    }
    return scope.module.values[name];
  }
  var file = fileOfImport(scope.module.filePath, binding.from);
  if (!file) return { sdkName: binding.imported };
  if (reading.files.indexOf(file) === -1) reading.files.push(file);
  var imported = moduleAt(file);
  var exportedAs = imported && imported.exports[binding.imported];
  if (!exportedAs) return OPAQUE;
  return lookUp(exportedAs, { module: imported, locals: {} }, depth + 1);
}

function isFunctionNode(node) {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

function refuseBody(closure, statement) {
  refuse(
    'the function ' +
      (closure.node.id ? closure.node.id.name : closure.name || '(unnamed)') +
      ' in ' +
      path.basename(closure.scope.module.filePath) +
      ' holds a statement the bundle cannot follow (' +
      statement.type +
      '), so what it sets on the phone is not known. Make the function return its preconditions with no branch'
  );
}

// A function the team wrote, called with `args`: its parameters are bound by name, and its result is
// the expression of an arrow, or the first `return` of a block after its constants.
function callClosure(closure, args, depth) {
  var locals = {};
  closure.node.params.forEach(function (param, index) {
    var target = param.type === 'AssignmentPattern' ? param.left : param;
    if (target.type !== 'Identifier') return;
    var value = args[index];
    if (value === undefined && param.type === 'AssignmentPattern') {
      value = evaluate(param.right, { module: closure.scope.module, locals: locals }, depth + 1);
    }
    locals[target.name] = value;
  });
  var scope = {
    module: closure.scope.module,
    locals: Object.assign({}, closure.scope.locals, locals),
  };
  var body = closure.node.body;
  if (body.type !== 'BlockStatement') return evaluate(body, scope, depth + 1);
  for (var i = 0; i < body.body.length; i++) {
    var statement = body.body[i];
    if (statement.type === 'ReturnStatement') {
      return statement.argument ? evaluate(statement.argument, scope, depth + 1) : undefined;
    }
    // Constants are followed; anything else before the return (a branch, a loop, a call) would make
    // the result depend on something the bundle cannot know, so it is refused, never guessed.
    if (statement.type !== 'VariableDeclaration') refuseBody(closure, statement);
    statement.declarations.forEach(function (declarator) {
      if (declarator.id.type !== 'Identifier' || !declarator.init) refuseBody(closure, statement);
      scope.locals[declarator.id.name] = evaluate(declarator.init, scope, depth + 1);
    });
  }
  return OPAQUE;
}

function callOf(callee, args, depth) {
  if (callee && callee.node) return callClosure(callee, args, depth);
  var name = callee && callee.sdkName;
  if (name === 'given') return args;
  if (MEMBERS[name]) return { member: MEMBERS[name] };
  return OPAQUE;
}

function evaluateObject(node, scope, depth) {
  var value = {};
  node.properties.forEach(function (prop) {
    if (prop.type === 'SpreadElement') {
      var spread = evaluate(prop.argument, scope, depth + 1);
      if (spread && typeof spread === 'object' && !Array.isArray(spread) && !spread.opaque) {
        Object.assign(value, spread);
      }
      return;
    }
    var name = prop.type === 'ObjectProperty' ? keyName(prop) : null;
    if (name !== null) value[name] = evaluate(prop.value, scope, depth + 1);
  });
  return value;
}

function evaluateArray(node, scope, depth) {
  var items = [];
  node.elements.forEach(function (element) {
    if (!element) return;
    if (element.type !== 'SpreadElement') {
      items.push(evaluate(element, scope, depth + 1));
      return;
    }
    var spread = evaluate(element.argument, scope, depth + 1);
    if (Array.isArray(spread)) items.push.apply(items, spread);
    else items.push(OPAQUE);
  });
  return items;
}

function evaluate(node, scope, depth) {
  if (depth > DEPTH_LIMIT) return OPAQUE;
  node = mockScan.unwrapExpression(node);
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'UnaryExpression':
      if (node.operator === '-' && node.argument.type === 'NumericLiteral') {
        return -node.argument.value;
      }
      return OPAQUE;
    case 'ObjectExpression':
      return evaluateObject(node, scope, depth);
    case 'ArrayExpression':
      return evaluateArray(node, scope, depth);
    case 'Identifier':
      return lookUp(node.name, scope, depth);
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'FunctionDeclaration':
      return { node: node, scope: scope };
    case 'CallExpression': {
      var callee = evaluate(node.callee, scope, depth + 1);
      var args = node.arguments.map(function (argument) {
        return evaluate(argument, scope, depth + 1);
      });
      return callOf(callee, args, depth);
    }
    case 'MemberExpression': {
      var object = evaluate(node.object, scope, depth + 1);
      var name = node.computed ? evaluate(node.property, scope, depth + 1) : node.property.name;
      if (object && typeof object === 'object' && !object.opaque && typeof name === 'string') {
        return Object.prototype.hasOwnProperty.call(object, name) ? object[name] : undefined;
      }
      return OPAQUE;
    }
    case 'ConditionalExpression': {
      var test = evaluate(node.test, scope, depth + 1);
      if (test === OPAQUE) return OPAQUE;
      return evaluate(test ? node.consequent : node.alternate, scope, depth + 1);
    }
    default:
      return OPAQUE;
  }
}

// Whether `value` holds a thing the interpreter could not work out, at any depth.
function holdsOpaque(value) {
  if (value === OPAQUE) return true;
  if (Array.isArray(value)) return value.some(holdsOpaque);
  if (value && typeof value === 'object')
    return Object.keys(value).some(function (key) {
      return holdsOpaque(value[key]);
    });
  return false;
}

// Every part of a list with its nested lists flattened, in order.
function flattened(value) {
  if (Array.isArray(value)) {
    return value.reduce(function (parts, item) {
      return parts.concat(flattened(item));
    }, []);
  }
  return [value];
}

/**
 * The phone settings of one scene, from its `given` list: each precondition's permissions, location
 * and member laid over the earlier ones, the later winning (per permission, for the location, for
 * the member).
 *
 * @param {object} givenNode - the AST node of the scene's `given` value
 * @param {string} filePath - the scene file, which relative imports are followed from
 * @param {string} source - the scene file's source
 * @param {string} where - names the scene in a refusal
 * @returns {{permissions?: object, location?: object, member?: string}}
 * @throws when a phone setting cannot be worked out, naming the file and the scene
 */
function phoneSettingsOfGiven(givenNode, filePath, source, where) {
  var record = moduleAt(filePath, source);
  var settings = {};
  if (!record) return settings;
  var parts = flattened(evaluate(givenNode, { module: record, locals: {} }, 0));
  parts.forEach(function (part) {
    if (!part || typeof part !== 'object' || part.opaque || part.node) return;
    ['device', 'member'].forEach(function (field) {
      if (part[field] !== undefined && holdsOpaque(part[field])) {
        throw new Error(
          'Scene file ' +
            path.basename(filePath) +
            ': the ' +
            field +
            ' of ' +
            where +
            ' must be known when the bundle is made (plain values, or functions of the team that return them), because the phone is set before the app starts.'
        );
      }
    });
    var device = part.device || {};
    if (device.permissions) {
      settings.permissions = Object.assign({}, settings.permissions, device.permissions);
    }
    if (device.location) settings.location = device.location;
    if (part.member) settings.member = part.member;
  });
  return settings;
}

// Which entries of a scene's own `given` list a file other than the scene file built: true for a
// call of a function, or a name, imported from a relative file; a list for a nested list; false for
// the rest. The runtime marks those entries' parts as shared (src/preconditions.ts partsOf).
// A name the scene file holds in a constant, or a function of the scene file it calls, is marked by
// what it holds or returns, so a shared precondition kept in the scene file still reads as shared.
function sharedMarkOf(node, record, depth) {
  depth = depth || 0;
  if (depth > DEPTH_LIMIT) return false;
  node = mockScan.unwrapExpression(node);
  if (node.type === 'ArrayExpression') {
    return node.elements.map(function (element) {
      if (!element) return false;
      if (element.type === 'SpreadElement') {
        refuse('a spread in the given list cannot be followed; list the preconditions one by one');
      }
      return sharedMarkOf(element, record, depth + 1);
    });
  }
  var head = node.type === 'CallExpression' ? mockScan.unwrapExpression(node.callee) : node;
  while (head.type === 'MemberExpression') head = mockScan.unwrapExpression(head.object);
  if (head.type !== 'Identifier') return false;
  var binding = record.bindings[head.name];
  if (!binding) return false;
  if (binding.from) return Boolean(fileOfImport(record.filePath, binding.from));

  var held = mockScan.unwrapExpression(binding.init);
  if (isFunctionNode(held)) {
    var isCallOfIt = node.type === 'CallExpression' && mockScan.unwrapExpression(node.callee) === head;
    return isCallOfIt ? sharedMarkOfResult(held, record, depth + 1) : false;
  }
  return node === head ? sharedMarkOf(held, record, depth + 1) : false;
}

// The mark of what a function of the scene file returns: the expression of an arrow, or the first
// `return` of a block after its constants, which the function's own names resolve through.
function sharedMarkOfResult(functionNode, record, depth) {
  var bindings = Object.assign({}, record.bindings);
  functionNode.params.forEach(function (param) {
    var target = param.type === 'AssignmentPattern' ? param.left : param;
    if (target.type === 'Identifier') delete bindings[target.name];
  });
  var inside = { filePath: record.filePath, bindings: bindings };
  var body = functionNode.body;
  if (body.type !== 'BlockStatement') return sharedMarkOf(body, inside, depth + 1);
  for (var i = 0; i < body.body.length; i++) {
    var statement = body.body[i];
    if (statement.type === 'ReturnStatement') {
      return statement.argument ? sharedMarkOf(statement.argument, inside, depth + 1) : false;
    }
    if (statement.type !== 'VariableDeclaration') return false;
    statement.declarations.forEach(function (declarator) {
      if (declarator.id.type === 'Identifier' && declarator.init) {
        bindings[declarator.id.name] = { init: declarator.init };
      }
    });
  }
  return false;
}

/**
 * What a scene's `given` list holds that the bundle must know: its phone settings, which entries a
 * shared file built, and the files read to work that out (a change to one reads the scene again).
 *
 * @param {object} givenNode - the AST node of the scene's `given` value
 * @param {string} filePath - the scene file, which relative imports are followed from
 * @param {string} source - the scene file's source
 * @param {string} where - names the scene in a refusal
 * @returns {{device: object, shared: boolean|Array, files: string[]}}
 * @throws when a phone setting or an entry's origin cannot be worked out, naming the file
 */
function readGiven(givenNode, filePath, source, where) {
  // Each reading starts from the files as they are now: a value kept from an earlier one would hide
  // a change in a file the scene's file imports.
  modules = {};
  reading = { fileName: path.basename(filePath), where: where, files: [] };
  var record = moduleAt(filePath, source);
  if (!record) return { device: {}, shared: false, files: [] };
  var device = phoneSettingsOfGiven(givenNode, filePath, source, where);
  var shared = sharedMarkOf(givenNode, record);
  return {
    device: device,
    shared: JSON.stringify(shared).indexOf('true') === -1 ? false : shared,
    files: reading.files,
  };
}

module.exports = { readGiven: readGiven, keyName: keyName };
