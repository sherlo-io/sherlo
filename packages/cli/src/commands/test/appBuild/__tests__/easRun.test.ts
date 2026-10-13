import { describe, it } from "vitest";

describe("sherlo test in EAS mode opens a run and lets EAS build",() => {
  it.todo("refuses EAS mode when package.json lacks the eas-build-on-complete or eas-build-on-cancel script, naming each one missing, before opening a run");
  it.todo("refuses EAS mode when eas.json has no profile build.easProfile names, showing the profile to add, before opening a run");
  it.todo("refuses EAS mode when the profile's env does not set SHERLO_BUILD to storybook, showing the line to add, before opening a run");
  it.todo("refuses EAS mode when the upload would leave out .sherlo/data.json, before opening a run");
  it.todo("opens the run with an empty slot per platform and writes .sherlo/data.json before the EAS builds start");
  it.todo("starts one EAS build per refused platform with build.easProfile, without waiting");
  it.todo("EAS mode spends a sherlo login like any push");
  it.todo("with --wait, EAS mode waits through the EAS builds and the run, under the wait's own exit codes");
  it.todo("writes the Sherlo address the run was opened on into .sherlo/data.json when SHERLO_API_URL set it");
  it.todo("writes the run's one-build ticket into .sherlo/data.json and never a project token");
});
