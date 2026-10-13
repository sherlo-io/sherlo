import { describe, it } from "vitest";

describe("ciRun", () => {
  it.todo("reads the join key of each CI service from the run id all its jobs share");
  it.todo("reads the GitHub join key as the repository and the run id, never the attempt");
  it.todo("--run-id, then SHERLO_RUN_ID, wins over the CI service's own run id");
  it.todo("with no CI run id and no --run-id there is no join key");
});
