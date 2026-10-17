import { describe, it } from 'vitest';

// Shells for task vcr-cli-github-sign-in (epic visual-check-reaches-test-apps). Each `it.todo` becomes a real `it(...)` with the exact same name.
describe("asking GitHub for the job's ID token", () => {
  it.todo("asks GitHub for the job's ID token with Sherlo's audience and the job's request token");
  it.todo('a failed request names the id-token permission');
});
