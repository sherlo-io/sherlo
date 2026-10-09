'use strict';

// How React Native's autolinking (@react-native-community/cli-config) and Expo's (its React Native
// config path) link this package's native code. They run this file as a script while an app is
// configured, so it can read the SHERLO_BUILD setting. See "What each build carries" in the book.
//
// - SHERLO_BUILD is `storybook` or `app-and-storybook`: the plain shape, so every iOS
//   configuration and every Android build type links the native module.
// - SHERLO_BUILD is `off` or unset: only the Debug configuration and the debug build type link it.
//   A store build sets nothing, so it carries none of Sherlo's native code.

// A published package holds the parser in dist-metro/ (its metro/ folder is not published); a
// checkout of this repository has only metro/.
function loadSherloBuildParser() {
  try {
    return require('./dist-metro/sherloBuild');
  } catch (distMetroMissing) {
    return require('./metro/sherloBuild');
  }
}

const sherloBuild = loadSherloBuildParser().readSherloBuild(process.env);
const isNativeCodeInEveryBuild = sherloBuild === 'storybook' || sherloBuild === 'app-and-storybook';

// Android's generated package list is one file shared by every build type, while `buildTypes` only
// limits the Gradle dependency. A plain import of SherloModulePackage would then fail to compile in
// a build that does not link the library. So the package is looked up by its class name: Sherlo's
// own package where the library is linked, a package with nothing in it where it is not.
const SHERLO_PACKAGE_CLASS = 'io.sherlo.storybookreactnative.SherloModulePackage';
const androidPackageFoundByName = `new Object() {
        com.facebook.react.ReactPackage loadSherloPackage() {
          try {
            return (com.facebook.react.ReactPackage) Class.forName("${SHERLO_PACKAGE_CLASS}").getDeclaredConstructor().newInstance();
          } catch (Exception sherloNotLinked) {
            return new com.facebook.react.ReactPackage() {
              public java.util.List createNativeModules(com.facebook.react.bridge.ReactApplicationContext context) { return java.util.Collections.emptyList(); }
              public java.util.List createViewManagers(com.facebook.react.bridge.ReactApplicationContext context) { return java.util.Collections.emptyList(); }
            };
          }
        }
      }.loadSherloPackage()`;

const debugOnlyPlatforms = {
  ios: { configurations: ['Debug'] },
  android: {
    buildTypes: ['debug'],
    packageImportPath: '// @sherlo/react-native-storybook: loaded by name below, linked in debug only',
    packageInstance: androidPackageFoundByName,
  },
};

// Empty objects change nothing: autolinking links every configuration and build type.
const everyBuildPlatforms = { ios: {}, android: {} };

module.exports = {
  dependency: {
    platforms: isNativeCodeInEveryBuild ? everyBuildPlatforms : debugOnlyPlatforms,
  },
};
