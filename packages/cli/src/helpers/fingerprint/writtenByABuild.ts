/**
 * Files a native build writes inside the folders the base fingerprint hashes (./baseFingerprint
 * hands them to `@expo/fingerprint` as `ignorePaths`; tested in ./__tests__/baseFingerprint). A
 * clean checkout has none of them and a built tree has them, often with the machine's toolchain
 * inside - so without this, a fingerprint taken after a build, or on a machine that built before,
 * differs from one taken on a fresh install of the same tree, and an unchanged project keys the
 * local build cache and the staged gate under another name.
 *
 * Only what no build reads is listed: a lockfile a build rewrites (Podfile.lock, a Swift package's
 * Package.resolved) stays hashed, because the same file is where a real native change lands. A real
 * change to a package still moves the fingerprint: its shipped sources, and its version in the
 * native module list, are hashed as before.
 *
 * The package entries are the list newer `@expo/fingerprint` releases ignore by default (0.20's
 * `DEFAULT_IGNORE_PATHS`), which the 0.11 line this CLI depends on lacks; Swift Package Manager and
 * `xcodebuild -derivedDataPath` folders are build output in any package, so they are ignored in
 * every one. The library adds this list to its own defaults, which already leave out `ios/Pods`,
 * `ios/build`, `ios/.xcode.env.local`, `android/build`, `.gradle` and `.cxx`.
 */
/**
 * Folders a build writes wherever they sit. The fingerprint ignores them by glob below, and
 * ./digestDirectory skips them by name, so a folder added here is covered in both.
 */
export const BUILD_WRITTEN_FOLDER_NAMES = ['.swiftpm', '.kotlin'];

export const WRITTEN_BY_A_BUILD = [
  // Swift Package Manager's folder and Kotlin 2's Gradle plugin folder (its daemon sessions and
  // error logs sit beside the Gradle project)
  ...BUILD_WRITTEN_FOLDER_NAMES.map((name) => `**/${name}/**/*`),
  // Xcode build folders, in any package
  '**/node_modules/**/.build/**/*',
  '**/node_modules/**/.DerivedData/**/*',
  // expo-modules-jsi's pod builds its xcframework and module map inside the package
  '**/node_modules/expo-modules-jsi/apple/{Products,.build,.DerivedData,.generated}/**/*',
  // CocoaPods prepare commands that generate sources inside the package
  '**/node_modules/expo-sqlite/ios/sqlite3.[ch]',
  '**/node_modules/expo-updates/ios/EXUpdates/BSPatch/bspatch.c',
  // Node addons are compiled for the installing machine
  '**/node_modules/**/*.node',
  // Xcode's per-user schemes and scheme list, written under the user's name on the machine that
  // opened or built the project; the library already leaves out the workspace's own xcuserdata
  '**/ios/*.xcodeproj/xcuserdata/**/*',
  // Xcode's record that it showed its 32-bit warning, written when it opens the workspace
  '**/ios/*.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist',
];
