'use strict';

// How React Native's autolinking (@react-native-community/cli-config) and Expo's (its React Native
// config path) link this package's native code. They run this file as a script while an app is
// configured, so it can read the SHERLO_BUILD setting.
//
// - SHERLO_BUILD is `storybook` or `app-and-storybook`: the plain shape, so every iOS
//   configuration and every Android build type links the native module.
// - SHERLO_BUILD is `off` or unset: only the debug iOS configurations and the debug Android build
//   type link it. A store build sets nothing, so it carries none of Sherlo's native code.
//
// The app's Podfile decides which iOS configurations are debug, whatever they are called: the ones
// it maps to :debug, plus Debug when the app target has it and the Podfile does not map it to
// :release. Only the app target's configurations count, never a test target's or an extension's.
// A name is never guessed from its wording. CocoaPods refuses a whitelisted name the app target
// does not have, and it reads an EMPTY list as "no limit" and links the pod into every
// configuration (cocoapods-core target_definition.rb:1133), so this file never answers an empty
// list: an app with no debug configuration gets no iOS platform at all.

// A published package holds the scripts in dist-metro/ (its metro/ folder is not published); a
// checkout of this repository has only metro/.
function loadMetroScript(name) {
  try {
    return require('./dist-metro/' + name);
  } catch (distMetroMissing) {
    return require('./metro/' + name);
  }
}

const sherloBuild = loadMetroScript('sherloBuild').readSherloBuild(process.env);
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

// Autolinking runs this file with the folder `pod install` runs in as the working directory
// (usually <app>/ios, or the app root with --project-directory=ios); Expo requires it in-process
// from the same folder. So the Podfile is looked for there, then in each parent.
const fs = require('fs');
const path = require('path');

function findPodfile() {
  let folder = process.cwd();
  for (;;) {
    for (const candidate of [path.join(folder, 'Podfile'), path.join(folder, 'ios', 'Podfile')]) {
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(folder);
    if (parent === folder) return null;
    folder = parent;
  }
}

// The Podfile's code, comment lines left out.
function readPodfileCode(podfile) {
  return fs
    .readFileSync(podfile, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

// The configuration names the Podfile maps, from every `'Name' => :debug` pair (the `project` and
// older `xcodeproj` calls).
function readPodfileMappings(podfileCode) {
  const mappings = new Map();
  for (const match of podfileCode.matchAll(/(['"])([^'"]+)\1\s*=>\s*:(debug|release)\b/g)) {
    mappings.set(match[2], match[3]);
  }
  return mappings;
}

// The configurations of the app target, the one CocoaPods checks a whitelist against: the
// application target named like a Podfile target, or every application target when the Podfile
// names none of them. A test target's or an extension's configurations never count.
function readAppTargetConfigurations(podfile, podfileCode) {
  const podfileTargets = [...podfileCode.matchAll(/^\s*target\s+(['"])([^'"]+)\1/gm)].map(
    (match) => match[2]
  );
  const xcodeProject = loadMetroScript('xcodeProject');
  const appTargets = xcodeProject
    .readXcodeProjects(path.dirname(podfile))
    .flatMap((project) => project.targets)
    .filter((target) => target.productType === xcodeProject.APPLICATION_PRODUCT_TYPE);
  const namedInPodfile = appTargets.filter((target) => podfileTargets.includes(target.name));
  return (namedInPodfile.length > 0 ? namedInPodfile : appTargets).flatMap(
    (target) => target.configurations
  );
}

// - no Podfile found, or it cannot be read: `Debug`, as before this file read the app.
// - at least one debug configuration: exactly those. When the app target is found, a name the
//   Podfile maps to debug and the app target lacks is left out; CocoaPods compares names without
//   regard to case.
// - none: `null`, so iOS does not link the module. The CLI answers null for a platform whose user
//   config is null (@react-native-community/cli-config-apple build/config/index.js:89-91), and
//   cli-config's schema allows it (build/schema.js:70-76).
function iosAnswer() {
  try {
    const podfile = findPodfile();
    if (!podfile) return { configurations: ['Debug'] };
    const podfileCode = readPodfileCode(podfile);
    const mappings = readPodfileMappings(podfileCode);
    const appConfigurations = readAppTargetConfigurations(podfile, podfileCode);
    const appSpellingOf = (name) =>
      appConfigurations.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    const debugConfigurations = [...mappings]
      .filter(
        ([name, kind]) =>
          kind === 'debug' && (appConfigurations.length === 0 || appSpellingOf(name))
      )
      .map(([name]) => name);
    const appDebug = appSpellingOf('Debug');
    const debugMappedToRelease = [...mappings].some(
      ([name, kind]) => name.toLowerCase() === 'debug' && kind === 'release'
    );
    if (appDebug && !debugMappedToRelease) debugConfigurations.push(appDebug);
    const unique = [...new Set(debugConfigurations)];
    return unique.length === 0 ? null : { configurations: unique };
  } catch (appUnreadable) {
    return { configurations: ['Debug'] };
  }
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
