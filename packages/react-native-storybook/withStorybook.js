'use strict';

var realModule = require('@storybook/react-native/metro/withStorybook');
var realWithStorybook = realModule.withStorybook || realModule.default || realModule;
var applySherloTransforms = require('./metro/applySherloTransforms');

function withStorybook(config, opts) {
  var result = realWithStorybook(config, opts);
  return applySherloTransforms(result, opts);
}

module.exports = withStorybook;
module.exports.default = withStorybook;
module.exports.withStorybook = withStorybook;
