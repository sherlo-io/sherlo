'use strict';

var path = require('path');
var applySherloTransforms = require('./applySherloTransforms');
var ensureStorybookRequires = require('./ensureStorybookRequires');
// SPIKE (launch-time-entry): Storybook 10.4+'s new setup is handled by a launch-time entry.
var launchTimeEntry = require('./launchTimeEntry');

function loadOldWithStorybook() {
  var realModule;
  try {
    realModule = require('@storybook/react-native/metro/withStorybook');
  } catch (_) {
    realModule = require('@storybook/react-native/withStorybook');
  }
  return realModule.withStorybook || realModule.default || realModule;
}

function withStorybook(config, opts) {
  var projectRoot = (config && config.projectRoot) || process.cwd();

  // SPIKE (launch-time-entry): the new setup. Storybook's own new wrapper is called ENABLED, for
  // what the Storybook side needs to bundle (its resolver tweaks, the generated requires file, the
  // channel server); its entry swap is then overridden by Sherlo's generated entry, which picks the
  // side at launch.
  var newSetup = launchTimeEntry.detectNewSetup(projectRoot, opts);
  if (newSetup) {
    // Storybook's own generate was seen to lose the race on a first cold bundle (Expo Router app):
    // "Unable to resolve ./storybook.requires". Same guard as the old setup.
    ensureStorybookRequires(opts);
    var newModule = require(
      require.resolve('@storybook/react-native/withStorybook', { paths: [projectRoot] })
    );
    var storybookResult = newModule.withStorybook(
      config,
      Object.assign({}, opts, { enabled: true, configPath: path.dirname(newSetup.storybookEntry) })
    );
    var sherloResult = applySherloTransforms(storybookResult, opts);
    return launchTimeEntry.applyLaunchTimeEntry(sherloResult, newSetup, opts);
  }

  // Must run BEFORE upstream's withStorybook returns a config to Metro - see
  // ensureStorybookRequires.js for the race this closes. No-op when the
  // requires file already exists.
  ensureStorybookRequires(opts);
  var realWithStorybook = loadOldWithStorybook();
  var result = realWithStorybook(config, opts);
  return applySherloTransforms(result, opts);
}

module.exports = withStorybook;
module.exports.default = withStorybook;
module.exports.withStorybook = withStorybook;
