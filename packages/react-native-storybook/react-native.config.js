'use strict';

// How React Native's autolinking (@react-native-community/cli-config) and Expo's (its React Native
// config path) link this package's native code. They run this file as a script while an app is
// configured, so it can read the SHERLO_BUILD setting.
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

// React Native's C++ autolinking file is shared by every build type too, and by default it adds the
// glue Sherlo's codegen writes into android/build/. Only a build that links the library runs that
// codegen, so a store build would have no such folder and fail to configure. android/cpp-autolinking
// is shipped with the package: it adds the generated glue where it exists, and an empty stand-in
// under the same names where it does not.
const CPP_LINKING_THAT_EVERY_BUILD_TYPE_HAS = 'cpp-autolinking/CMakeLists.txt';

// CocoaPods refuses a whitelisted configuration name the app does not have, so the iOS answer comes
// from the app itself. The Podfile is the source of truth, the way CocoaPods reads it: a
// configuration its `project` line maps to :debug is debug, one it does not mark is release, and
// plain `Debug` is debug. Autolinking runs this file with the folder `pod install` runs in as the
// working directory, which is the app's ios/ folder (a Podfile there, or in a parent's ios/).
const fs = require('fs');
const path = require('path');

function findIosFolder() {
  let folder = process.cwd();
  for (let step = 0; step < 6; step++) {
    if (fs.existsSync(path.join(folder, 'Podfile'))) return folder;
    if (fs.existsSync(path.join(folder, 'ios', 'Podfile'))) return path.join(folder, 'ios');
    const parent = path.dirname(folder);
    if (parent === folder) break;
    folder = parent;
  }
  return null;
}

function readXcodeConfigurationNames(iosFolder) {
  const names = [];
  for (const entry of fs.readdirSync(iosFolder)) {
    if (!entry.endsWith('.xcodeproj')) continue;
    const pbxproj = fs.readFileSync(path.join(iosFolder, entry, 'project.pbxproj'), 'utf8');
    const section = pbxproj.split('Begin XCBuildConfiguration section')[1];
    if (!section) continue;
    const sectionText = section.split('End XCBuildConfiguration section')[0];
    for (const match of sectionText.matchAll(/^\s*name = (?:"([^"]+)"|([^;\s]+));/gm)) {
      names.push(match[1] || match[2]);
    }
  }
  return names;
}

// null: the app's iOS folder cannot be read, so the answer stays the old plain `Debug`.
function readIosDebugConfigurations() {
  try {
    const iosFolder = findIosFolder();
    if (!iosFolder) return null;
    const podfile = fs
      .readFileSync(path.join(iosFolder, 'Podfile'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    const mapped = new Map();
    for (const match of podfile.matchAll(/(['"])([^'"]+)\1\s*=>\s*:(debug|release)\b/g)) {
      mapped.set(match[2], match[3]);
    }
    const projectNames = readXcodeConfigurationNames(iosFolder);
    const debugNames = [...mapped].filter(([, kind]) => kind === 'debug').map(([name]) => name);
    if (projectNames.includes('Debug') && mapped.get('Debug') !== 'release') debugNames.push('Debug');
    return [...new Set(debugNames)];
  } catch (iosFolderUnreadable) {
    return null;
  }
}

// - null (cannot read the app): `Debug`, as before this file read the app.
// - a list: exactly the debug configurations.
// - an empty list (the app has no debug configuration): `null` for the platform, so the pod is not
//   linked at all. An empty `configurations` list would mean every configuration to CocoaPods.
function iosAnswer() {
  const debugConfigurations = readIosDebugConfigurations();
  if (debugConfigurations === null) return { configurations: ['Debug'] };
  if (debugConfigurations.length === 0) return null;
  return { configurations: debugConfigurations };
}

const debugOnlyPlatforms = {
  ios: iosAnswer(),
  android: {
    buildTypes: ['debug'],
    packageImportPath:
      '// @sherlo/react-native-storybook: loaded by name below, linked in debug only',
    packageInstance: androidPackageFoundByName,
    cmakeListsPath: CPP_LINKING_THAT_EVERY_BUILD_TYPE_HAS,
  },
};

// Empty objects change nothing: autolinking links every configuration and build type.
const everyBuildPlatforms = { ios: {}, android: {} };

module.exports = {
  dependency: {
    platforms: isNativeCodeInEveryBuild ? everyBuildPlatforms : debugOnlyPlatforms,
  },
};
