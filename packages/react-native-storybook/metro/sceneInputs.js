'use strict';

// ---------------------------------------------------------------------------
// A scene's inputs, checked while the bundle is made
// ---------------------------------------------------------------------------
//
// A scene takes three inputs (src/scenes.ts, Scene): `given`, `play` and `ready`. A scene file is
// only parsed, never run, so a missing or wrong input is found here, from the source, and refused
// naming the file, the scene and the input - before the app is built, never in the middle of a
// capture. Only what the source writes out as a literal is judged: a value the team computes (a
// name, a call) is left to the type checker.

var givenReader = require('./givenReader');
var mockScan = require('./mockScan');

var keyName = givenReader.keyName;

var SCENE_INPUTS = ['given', 'play', 'ready'];
var DIRECTIONS = ['left', 'right', 'up', 'down'];

// What the source writes at `node`: the kind of literal, or 'computed' for anything else.
function literalKindOf(node) {
  node = mockScan.unwrapExpression(node);
  switch (node.type) {
    case 'StringLiteral':
      return 'a string';
    case 'NumericLiteral':
      return 'a number';
    case 'BooleanLiteral':
      return 'a boolean';
    case 'NullLiteral':
      return 'null';
    case 'ArrayExpression':
      return 'a list';
    case 'ObjectExpression':
      return 'an object';
    default:
      return 'computed';
  }
}

// The value node of the property `name` of an object node, or null.
function valueOf(object, name) {
  for (var i = 0; i < object.properties.length; i++) {
    var prop = object.properties[i];
    if (prop.type === 'ObjectProperty' && keyName(prop) === name) return prop.value;
  }
  return null;
}

// Checks one scene file's scene. `where` names it for a refusal: 'Scene file x.scenes.tsx: scene Y'.
function refuseWrongInputs(fileName, sceneName, sceneValue) {
  var where = 'Scene file ' + fileName + ': scene ' + sceneName;

  function refuse(reason) {
    throw new Error(where + ' ' + reason + '.');
  }

  // The kind of `node` must be one of `allowed` (a computed value passes).
  function mustBe(node, allowed, what) {
    var kind = literalKindOf(node);
    if (kind !== 'computed' && allowed.indexOf(kind) === -1) {
      refuse('has ' + what + ' that is ' + kind + ', where ' + allowed.join(' or ') + ' belongs');
    }
  }

  // A literal object `node` must hold each name in `required`, and a string for each in `strings`.
  function mustHold(node, step, required, strings) {
    node = mockScan.unwrapExpression(node);
    if (node.type !== 'ObjectExpression') return;
    required.forEach(function (name) {
      if (!valueOf(node, name)) refuse('has a "' + step + '" step with no "' + name + '"');
    });
    strings.forEach(function (name) {
      var value = valueOf(node, name);
      if (value) mustBe(value, ['a string'], 'the "' + name + '" of a "' + step + '" step');
    });
  }

  var sceneNode = mockScan.unwrapExpression(sceneValue);
  if (literalKindOf(sceneNode) === 'computed') return;
  if (sceneNode.type !== 'ObjectExpression') {
    refuse('is ' + literalKindOf(sceneNode) + ', where an object of given, play and ready belongs');
  }

  sceneNode.properties.forEach(function (prop) {
    var name = prop.type === 'ObjectProperty' ? keyName(prop) : null;
    if (name !== null && SCENE_INPUTS.indexOf(name) === -1) {
      refuse(
        'has an input "' + name + '", which a scene does not take (' + SCENE_INPUTS.join(', ') + ')'
      );
    }
  });

  var given = valueOf(sceneNode, 'given');
  if (given) mustBe(given, ['a list', 'an object'], 'a "given"');

  var ready = valueOf(sceneNode, 'ready');
  if (ready) mustBe(ready, ['a string', 'an object'], 'a "ready"');

  var play = valueOf(sceneNode, 'play');
  if (!play) return;
  mustBe(play, ['a list'], 'a "play"');
  play = mockScan.unwrapExpression(play);
  if (play.type !== 'ArrayExpression') return;
  play.elements.forEach(function (step) {
    if (!step || step.type === 'SpreadElement') return;
    refuseWrongStep(step);
  });

  function refuseWrongStep(step) {
    mustBe(step, ['an object'], 'a "play" step');
    step = mockScan.unwrapExpression(step);
    if (step.type !== 'ObjectExpression') return;
    step.properties.forEach(function (prop) {
      var kind = prop.type === 'ObjectProperty' ? keyName(prop) : null;
      if (kind === null) return;
      var value = prop.value;
      if (kind === 'tap' || kind === 'longPress') {
        mustBe(value, ['a string', 'an object'], 'the "' + kind + '" of a "play" step');
        mustHold(value, kind, [], ['testID', 'text', 'label']);
      } else if (kind === 'type') {
        mustBe(value, ['an object'], 'the "type" of a "play" step');
        mustHold(value, kind, ['testID', 'text'], ['testID', 'text']);
      } else if (kind === 'swipe') {
        mustBe(value, ['an object'], 'the "swipe" of a "play" step');
        mustHold(value, kind, ['testID', 'direction'], ['testID', 'direction']);
        checkDirection(value);
      } else if (kind === 'open') {
        mustBe(value, ['a string'], 'the "open" of a "play" step');
      } else if (kind === 'ready') {
        mustBe(value, ['a string', 'an object'], 'the "ready" of a "play" step');
      } else {
        refuse(
          'has a "play" step "' +
            kind +
            '", which is no step (tap, longPress, type, swipe, open, ready)'
        );
      }
    });
  }

  function checkDirection(swipe) {
    swipe = mockScan.unwrapExpression(swipe);
    if (swipe.type !== 'ObjectExpression') return;
    var direction = valueOf(swipe, 'direction');
    var node = direction && mockScan.unwrapExpression(direction);
    if (node && node.type === 'StringLiteral' && DIRECTIONS.indexOf(node.value) === -1) {
      refuse(
        'has a "swipe" step with the direction "' + node.value + '" (' + DIRECTIONS.join(', ') + ')'
      );
    }
  }
}

module.exports = { refuseWrongInputs: refuseWrongInputs };
