'use strict';

// The one parser of the SHERLO_BUILD setting. The bundler reads it here (metro/withStorybook.js),
// and so does the native build (the package's own react-native.config.js, run by CocoaPods and
// Gradle), from the published copy dist-metro/sherloBuild.js. Keep it plain ES5 with no
// dependencies, so plain Node can require it from either side.
//
// SHERLO_BUILD says how much of Sherlo and Storybook a build carries:
//   storybook          Storybook and Sherlo; the app only on the old setup
//   app-and-storybook  the app, with Storybook and Sherlo beside it
//   off                the app alone: no Sherlo, no Storybook

var SHERLO_BUILD_VALUES = ['storybook', 'app-and-storybook', 'off'];

/**
 * @param {object} env - the environment to read, usually process.env
 * @returns {'storybook'|'app-and-storybook'|'off'|null} the value set, or null when it is unset
 *   or empty
 * @throws {Error} naming the three values, when the value is none of them
 */
function readSherloBuild(env) {
  var value = env.SHERLO_BUILD;
  if (value === undefined || value === '') return null;

  if (SHERLO_BUILD_VALUES.indexOf(value) === -1) {
    throw new Error(
      'Unknown SHERLO_BUILD value "' +
        value +
        '". Use storybook, app-and-storybook or off, or leave it unset.'
    );
  }
  return value;
}

/**
 * What this build carries, after every switch has had its say. A set SHERLO_BUILD wins; unset,
 * STORYBOOK_ENABLED=true counts as `storybook`; unset in a release build is `off`; unset in a
 * debug build is `app-and-storybook`, with Storybook's own `enabled` option deciding Storybook,
 * as it did before Sherlo.
 *
 * @param {object} env - the environment to read, usually process.env
 * @param {boolean} isReleaseBuild - whether this build is a release build
 * @param {*} storybookEnabledOption - the `enabled` option the developer gave Storybook's
 *   wrapper, as given (undefined when they gave none)
 * @returns {{ sherloBuild: 'storybook'|'app-and-storybook'|'off', storybookEnabled: * }}
 *   `storybookEnabled` is what to hand Storybook's wrapper as its `enabled` option
 */
function whatThisBuildCarries(env, isReleaseBuild, storybookEnabledOption) {
  var sherloBuild = readSherloBuild(env);

  if (sherloBuild !== null) {
    return { sherloBuild: sherloBuild, storybookEnabled: sherloBuild !== 'off' };
  }
  if (env.STORYBOOK_ENABLED === 'true') {
    return { sherloBuild: 'storybook', storybookEnabled: true };
  }
  if (isReleaseBuild) {
    return { sherloBuild: 'off', storybookEnabled: false };
  }
  return { sherloBuild: 'app-and-storybook', storybookEnabled: storybookEnabledOption };
}

module.exports = {
  readSherloBuild: readSherloBuild,
  whatThisBuildCarries: whatThisBuildCarries,
};
