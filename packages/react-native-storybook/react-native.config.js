// SPIKE (debug-only-native): Sherlo's native module is linked into debug builds only, unless the
// build sets SHERLO_IN_RELEASE=1 (placeholder name), which links it into every build.
// Read by React Native's autolinking (@react-native-community/cli-config) and by Expo's
// (expo-modules-autolinking, its React Native config path) when the app is configured.
const isSherloInRelease = process.env.SHERLO_IN_RELEASE === '1';

// Android's generated PackageList.java is one file shared by every build type, while `buildTypes`
// only limits the Gradle dependency. A plain `import ...SherloModulePackage;` would then fail to
// compile in a release build that does not carry the library. So the package is looked up by name:
// Sherlo's own package where the library is linked, a package with nothing in it where it is not.
const SHERLO_PACKAGE_CLASS = 'io.sherlo.storybookreactnative.SherloModulePackage';
const androidPackageInstance = `new Object() {
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

module.exports = {
  dependency: {
    platforms: {
      // Empty list = every configuration / build type (autolinking's own default).
      ios: { configurations: isSherloInRelease ? [] : ['Debug'] },
      android: {
        buildTypes: isSherloInRelease ? [] : ['debug'],
        packageImportPath: '// @sherlo/react-native-storybook: loaded by name below, linked in debug only',
        packageInstance: androidPackageInstance,
      },
    },
  },
};
