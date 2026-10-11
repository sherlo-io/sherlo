import { describe, it } from 'vitest';

describe('the pull request checks workflow', () => {
  it('pr_checks ends in one final job named checks that waits for every package job', () => {});

  it('checks always runs and fails when a package job failed or was cancelled', () => {});

  it('pr_checks runs on every push to a pull request, drafts included', () => {});
});
