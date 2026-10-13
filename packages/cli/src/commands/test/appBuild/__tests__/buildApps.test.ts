import { describe, it } from "vitest";

describe("sherlo test builds the app on this machine",() => {
  it.todo("refuses iOS on a machine that is not a Mac, naming --platform android here and --platform ios on a Mac");
  it.todo("refuses iOS when Xcode is not found, naming xcode-select");
  it.todo("refuses a workspace with several iOS schemes and none named, listing them and the config line that names one");
  it.todo("refuses Android when no Java is found, naming JDK 17 and JAVA_HOME");
  it.todo("refuses Android on a Java older than 17, naming the version it found");
  it.todo("refuses Android when no Android SDK is found, naming ANDROID_HOME and sdk.dir");
  it.todo("checks the machine for every platform before the first build starts");
  it.todo("keys the local build cache by the platform, the base fingerprint and the build settings");
  it.todo("takes an app build from the local build cache and compiles nothing");
  it.todo("a changed build setting misses the local build cache");
  it.todo("keeps the local build cache in --build-cache, else build-cache in SHERLO_CACHE_DIR, else in the computer's cache folder");
  it.todo("writes .sherlo/.gitignore ignoring everything but data.json the first time it writes the folder");
  it.todo("a cache hit in sherlo test compiles nothing and its row says it came from the local build cache");
  it.todo("generates the native folder with expo prebuild only when it is missing in an Expo app");
  it.todo("never runs expo prebuild over a native folder that is there");
  it.todo("builds the platforms one after the other unless parallel builds are asked for");
  it.todo("a failed build prints the log's last lines, uploads nothing and exits 2");
  it.todo("on a failed build, the list of native changes sits above the log's last lines");
  it.todo("a project's own build command replaces Sherlo's and skips the machine checks");
  it.todo("a project's own build command runs with the variables Sherlo's own build sets");
});
