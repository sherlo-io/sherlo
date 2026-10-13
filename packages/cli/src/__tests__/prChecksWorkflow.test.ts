import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const WORKFLOWS = path.resolve(__dirname, '../../../../.github/workflows');

const workflowText = fs.readFileSync(path.join(WORKFLOWS, 'pr_checks.yml'), 'utf8');

/** The workflow without its comment lines, so a comment never satisfies or breaks a rule. */
const workflowWithoutComments = workflowText
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

const jobsSection = workflowWithoutComments.slice(workflowWithoutComments.search(/^jobs:\s*$/m));
const jobIds = [...jobsSection.matchAll(/^ {2}(\S+):\s*$/gm)].map((match) => match[1]);

/** The text of one job, from its id line to the next job (or the end of the file). */
function jobText(jobId: string): string {
  const start = jobsSection.search(new RegExp(`^ {2}${jobId}:\\s*$`, 'm'));
  const rest = jobsSection.slice(start + 1);
  const nextJob = rest.search(/^ {2}\S+:\s*$/m);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

const installActionText = fs.readFileSync(
  path.resolve(WORKFLOWS, '../actions/install-with-libs/action.yml'),
  'utf8'
);

describe('the pull request checks workflow', () => {
  it('pr_checks ends in one final job named checks that waits for every package job', () => {
    expect(jobIds[jobIds.length - 1]).toBe('checks');
    expect(jobIds.filter((jobId) => jobId === 'checks')).toHaveLength(1);
    expect(jobText('checks')).toMatch(/^ {4}needs: \[package-checks\]\s*$/m);
    // No name: key, so GitHub shows the job as exactly `checks`.
    expect(jobText('checks')).not.toMatch(/^ {4}name:/m);
  });

  it('checks always runs and fails when a package job failed or was cancelled', () => {
    const finalJob = jobText('checks');
    expect(finalJob).toMatch(/^ {4}if: \$\{\{ always\(\) \}\}\s*$/m);
    expect(finalJob).toContain("join(needs.*.result, ' ')");
    expect(finalJob).toContain('failure');
    expect(finalJob).toContain('cancelled');
    expect(finalJob).toContain('exit 1');
    // This repository's checks run on drafts too.
    expect(workflowText).not.toMatch(/draft/i);
  });

  it('pr_checks runs on every push to a pull request, drafts included', () => {
    const triggers = workflowWithoutComments.slice(
      workflowWithoutComments.search(/^on:/m),
      workflowWithoutComments.search(/^jobs:/m)
    );
    expect(triggers).toMatch(/^ {2}pull_request:/m);
    expect(triggers).not.toMatch(/types:/);
    expect(triggers).toMatch(/- main\b/);
    expect(triggers).toMatch(/- feature\/sherlo-3\b/);
    expect(triggers).toContain('- epic/**');
  });

  it('pr_checks also starts by hand', () => {
    const triggers = workflowWithoutComments.slice(
      workflowWithoutComments.search(/^on:/m),
      workflowWithoutComments.search(/^jobs:/m)
    );
    expect(triggers).toMatch(/^ {2}workflow_dispatch:/m);
    expect(triggers).toMatch(/^ {2}pull_request:/m);
    // The install action resolves the libraries for a run started by hand, which has no PR refs.
    expect(installActionText).toContain('"$EVENT_NAME" = "workflow_dispatch"');
    expect(installActionText).toContain('HEAD_BRANCH="${GITHUB_HEAD_REF:-$GITHUB_REF_NAME}"');
    expect(installActionText).not.toContain('"$GITHUB_HEAD_REF" == epic/*');
  });
});
