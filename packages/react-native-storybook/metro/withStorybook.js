'use strict';

var realModule;
try {
  realModule = require('@storybook/react-native/metro/withStorybook');
} catch (_) {
  realModule = require('@storybook/react-native/withStorybook');
}
var realWithStorybook = realModule.withStorybook || realModule.default || realModule;
var applySherloTransforms = require('./applySherloTransforms');
var ensureStorybookRequires = require('./ensureStorybookRequires');

function withStorybook(config, opts) {
  // Must run BEFORE upstream's withStorybook returns a config to Metro - see
  // ensureStorybookRequires.js for the race this closes. No-op when the
  // requires file already exists.
  ensureStorybookRequires(opts);
  var result = realWithStorybook(config, opts);
  return applySherloTransforms(result, opts);
}

module.exports = withStorybook;
module.exports.default = withStorybook;
module.exports.withStorybook = withStorybook;
