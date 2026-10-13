import { describe, it } from "vitest";

describe("app builder, Android", () => {
  it.todo("builds Android with :app:assembleRelease for arm64-v8a only");
  it.todo("runs Gradle with an 8 GB heap and 2 GB of metaspace");
  it.todo("runs Gradle with its build cache on");
  it.todo("the Gradle init script forces the debug signing key on the release build");
  it.todo("the Gradle init script ships inside the compiled CLI as text, never as a file read beside it");
  it.todo("the Gradle init script switches expo-updates off in the merged manifest and edits no file of the app");
  it.todo("removes Gradle's saved autolinking answer before every Android build");
  it.todo("finds the Android app build through output-metadata.json");
  it.todo("removes the native folder expo prebuild made and puts package.json back");
  it.todo("runs expo prebuild with the build's variables");
  it.todo("passes build.env and the eas.json profile's env to the build and to the bundler");
  it.todo("sets SHERLO_BUILD to storybook last, over the shell, the eas.json profile env and build.env");
  it.todo("keeps an app build in a folder named by its cache key, directly inside the local build cache");
  it.todo("keeping an app build in the local build cache removes nothing from it");
  it.todo("a run that reaches the app builder with no appBuild in the pose is refused before anything on this machine is looked at");
});

describe("app builder, iOS", () => {
  it.todo("builds iOS with xcodebuild in Release for the arm64 simulator, with code signing off");
  it.todo("builds iOS with Xcode's compilation cache on in Xcode's own folder, and no dSYM");
  it.todo("finds the iOS app build through xcodebuild's build settings, never by scanning");
  it.todo("runs pod install before every iOS build, with SHERLO_BUILD set to storybook");
  it.todo("warns once when pod install changes files the project does not commit");
  it.todo("switches expo-updates off in the built iOS app's Expo.plist");
});
