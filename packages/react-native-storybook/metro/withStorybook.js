'use strict';

var realModule;
try {
  realModule = require('@storybook/react-native/metro/withStorybook');
} catch (_) {
  realModule = require('@storybook/react-native/withStorybook');
}
var realWithStorybook = realModule.withStorybook || realModule.default || realModule;
var applySherloTransforms = require('./applySherloTransforms');

function withStorybook(config, opts) {
  var result = realWithStorybook(config, opts);
  return applySherloTransforms(result, opts);
}

module.exports = withStorybook;
module.exports.default = withStorybook;
module.exports.withStorybook = withStorybook;
