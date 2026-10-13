import { describe, it } from "vitest";

describe("nativeChanges", () => {
  it.todo("when native code changed, counts and lists the changes since the stored app build under the build line");
  it.todo("lists at most eight native changes and counts the rest as and N more");
  it.todo("names the changed file inside a bare project's native folder, from per-file hashes kept for the list alone");
  it.todo("a native folder stored without its files is listed as the folder");
  it.todo("with nothing stored, or a stored app build with no source list, the build line lists no changes");
});
