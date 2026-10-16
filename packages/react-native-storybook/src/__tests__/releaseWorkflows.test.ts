/**
 * What a release does around the publish, and which branches the SDK's workflows run on. Read from
 * the workflow files as text; nothing here reaches the network.
 */
import { describe, expect, it } from 'vitest';
import { namedStepsOf, workflowWithoutComments } from './workflowSteps';

const RELEASE_WORKFLOW = 'release-sherlo-packages.yml';
const SKIPPED_WHEN_ALPHA = /^\s+if: \$\{\{ github\.event\.inputs\.IS_ALPHA != 'true' \}\}\s*$/m;

function releaseSteps() {
  const steps = namedStepsOf(RELEASE_WORKFLOW);
  const positionOf = (stepName: string) => {
    const position = steps.findIndex((step) => step.name === stepName);
    expect(position, stepName).toBeGreaterThanOrEqual(0);
    return position;
  };
  const stepNamed = (stepName: string) => steps[positionOf(stepName)];
  return { steps, positionOf, stepNamed };
}

/** The lines of a workflow's `on:` block, without comments. */
function triggersOf(workflowFile: string): string {
  const workflow = workflowWithoutComments(workflowFile);
  const start = workflow.search(/^on:\s*$/m);
  expect(start, workflowFile).toBeGreaterThanOrEqual(0);
  const rest = workflow.slice(start).split('\n').slice(1);
  const end = rest.findIndex((line) => /^\S/.test(line));
  return rest.slice(0, end === -1 ? rest.length : end).join('\n');
}

describe('what a release does around the publish', () => {
  it('a release refuses a ref that is not a release branch, before any other step', () => {
    const { steps } = releaseSteps();
    const guard = steps[0];
    expect(guard.body).toContain('GITHUB_REF_NAME');
    expect(guard.body).toContain('^release/r[0-9]+(\\.[0-9]+)?$');
    expect(guard.body).toContain('::error::');
    expect(guard.body).toContain('exit 1');
    // It applies to alpha and public alike.
    expect(guard.body).not.toMatch(/^\s+if:/m);
  });

  it("A release whose pinned core's source tree is on no commit of sherlo-runner's default branch or of a runner release branch stops before it commits anything", () => {
    const { steps, positionOf } = releaseSteps();
    const mergeCheckPosition = positionOf(
      "Check the pinned core's source tree is on sherlo-runner's default branch or a runner release branch"
    );
    const mergeCheck = steps[mergeCheckPosition];
    expect(mergeCheck.body).toContain(
      '.sourceTree packages/react-native-storybook/sherlo-core.json'
    );
    expect(mergeCheck.body).toContain('repos/sherlo-io/sherlo-runner/commits?sha=');
    expect(mergeCheck.body).toContain('path=core');
    expect(mergeCheck.body).toContain('repos/sherlo-io/sherlo-runner/git/trees/');
    expect(mergeCheck.body).toContain('exit 1');

    // It reads sherlo-runner with the bot's token, minted before it...
    expect(mergeCheck.body).toContain('GH_TOKEN: ${{ steps.github_app_token.outputs.token }}');
    expect(positionOf('Create GH App Token')).toBeLessThan(mergeCheckPosition);
    // ...on the checked-out pin, which only exists after the checkout...
    const checkoutPosition = steps.findIndex((step) => step.body.includes('actions/checkout'));
    expect(checkoutPosition).toBeLessThan(mergeCheckPosition);
    // ...looks on the default branch and on every runner release branch...
    expect(mergeCheck.body).toContain('gh api repos/sherlo-io/sherlo-runner/branches --paginate');
    expect(mergeCheck.body).toContain('startswith("release/r")');
    expect(mergeCheck.body).toMatch(/for BRANCH in "\$DEFAULT_BRANCH" \$RELEASE_BRANCHES/);
    // ...and passes only a source tree that a commit changing `core` there holds, however that
    // commit was merged: the commit's own `core` tree entry is compared to the pin.
    expect(mergeCheck.body).toContain('select(.path == "core")');
    expect(mergeCheck.body).toContain('"$CORE_TREE" = "$SOURCE_TREE"');
    // The error names both places it looked.
    expect(mergeCheck.body).toMatch(/default branch \$DEFAULT_BRANCH or on a release\/r\* branch/);
    // Before anything is installed or committed.
    expect(mergeCheckPosition).toBeLessThan(positionOf('Install dependencies'));
    expect(mergeCheckPosition).toBeLessThan(positionOf('Commit and push version updates'));
  });

  it('a public release stops before it commits anything when main cannot move forward to it', () => {
    const { steps, positionOf, stepNamed } = releaseSteps();
    const mainCheck = stepNamed('Check main can move forward to the release');
    expect(mainCheck.body).toMatch(SKIPPED_WHEN_ALPHA);
    expect(mainCheck.body).toContain('git fetch origin main');
    expect(mainCheck.body).toContain('git merge-base --is-ancestor origin/main HEAD');
    expect(mainCheck.body).toContain('main cannot move forward to');
    expect(mainCheck.body).toContain('exit 1');
    // The checkout has the whole history, so the ancestry can be read.
    const checkout = steps.find((step) => step.body.includes('actions/checkout'));
    expect(checkout?.body).toContain('fetch-depth: 0');
    expect(positionOf('Check main can move forward to the release')).toBeLessThan(
      positionOf('Commit and push version updates')
    );
  });

  it('an alpha release publishes version-alpha.N under the alpha tag and leaves main, the git tags and the GitHub release alone', () => {
    const { steps, positionOf, stepNamed } = releaseSteps();
    // The version: one past the highest alpha of that version on npm, 0 when none.
    const versionPosition = positionOf('Choose the version to publish');
    const versionStep = steps[versionPosition];
    expect(versionStep.body).toContain('npm view "$PACKAGE" versions --json');
    expect(versionStep.body).toContain(
      'RELEASE_VERSION="$NEW_VERSION_NUMBER-alpha.$((HIGHEST + 1))"'
    );
    expect(versionStep.body).toContain('HIGHEST=-1');
    expect(versionStep.body).toContain('echo "RELEASE_VERSION=$RELEASE_VERSION" >> "$GITHUB_ENV"');
    expect(versionPosition).toBeLessThan(positionOf('Bump Version'));
    // Every step after it that an alpha runs uses that version, never the bare input.
    const runOnAlphaAfterIt = steps
      .slice(versionPosition + 1)
      .filter((step) => !SKIPPED_WHEN_ALPHA.test(step.body));
    for (const step of runOnAlphaAfterIt) {
      expect(step.body, step.name).not.toContain('NEW_VERSION_NUMBER');
    }
    expect(stepNamed('Bump Version').body).toContain('lerna version $RELEASE_VERSION');

    // Published under the alpha tag.
    expect(stepNamed('Publish to npm').body).toContain(
      "--dist-tag ${{ github.event.inputs.IS_ALPHA == 'true' && 'alpha' || 'latest' }}"
    );
    // Nothing that commits, tags, pushes or releases runs on an alpha.
    for (const stepName of [
      'Commit and push version updates',
      'Tag Commit',
      'Push the action release ref',
      'Move main forward to the release',
      'Create Release',
      'Wait for npm registry propagation',
      'Update lock files in examples and test directories',
      'Commit and push updated lock files',
      'Move main forward to the lockfile commit',
    ]) {
      expect(stepNamed(stepName).body, stepName).toMatch(SKIPPED_WHEN_ALPHA);
    }
    const pushesRunOnAlpha = steps
      .filter((step) => /git push|push: true|action-gh-release/.test(step.body))
      .filter((step) => !SKIPPED_WHEN_ALPHA.test(step.body))
      .map((step) => step.name);
    expect(pushesRunOnAlpha).toEqual([]);
  });

  it('a public release whose version npm already has skips the publish and carries on', () => {
    const { positionOf, stepNamed } = releaseSteps();
    const publish = stepNamed('Publish to npm').body;
    const sherloLookup = publish.indexOf('npm view "sherlo@$RELEASE_VERSION" version');
    const sdkLookup = publish.indexOf(
      'npm view "@sherlo/react-native-storybook@$RELEASE_VERSION" version'
    );
    expect(sherloLookup).toBeGreaterThanOrEqual(0);
    expect(sdkLookup).toBeGreaterThanOrEqual(0);
    expect(Math.max(sherloLookup, sdkLookup)).toBeLessThan(publish.indexOf('lerna publish'));
    // The skip is said in the step summary and ends the step well, so the rest of the release runs.
    expect(publish).toContain('$GITHUB_STEP_SUMMARY');
    expect(publish).toMatch(/GITHUB_STEP_SUMMARY"?\s*\n\s*exit 0/);
    // The key stamp and its restore stay around it.
    expect(positionOf("Stamp Sherlo's public key into the native loaders")).toBeLessThan(
      positionOf('Publish to npm')
    );
    expect(positionOf('Restore the native loaders to the test key')).toBeGreaterThan(
      positionOf('Publish to npm')
    );
  });

  it('a public release tags v and its version', () => {
    const { positionOf, stepNamed } = releaseSteps();
    const tag = stepNamed('Tag Commit').body;
    expect(tag).toMatch(SKIPPED_WHEN_ALPHA);
    expect(tag).toContain('git tag "v$RELEASE_VERSION"');
    expect(tag).toContain('git push origin "v$RELEASE_VERSION"');
    expect(tag).not.toMatch(
      /git tag "?\$(RELEASE_VERSION|NEW_VERSION_NUMBER)|inputs\.NEW_VERSION_NUMBER/
    );
    expect(positionOf('Tag Commit')).toBeGreaterThan(positionOf('Publish to npm'));
  });

  it('a second press of a public release whose tag already points at the release carries on', () => {
    const tag = releaseSteps().stepNamed('Tag Commit').body;
    // It reads the tag origin already has before it makes one.
    const lookup = tag.indexOf('git ls-remote --tags origin "refs/tags/v$RELEASE_VERSION"');
    expect(lookup).toBeGreaterThanOrEqual(0);
    expect(lookup).toBeLessThan(tag.indexOf('git tag "v$RELEASE_VERSION"'));
    expect(tag).toContain('RELEASE_COMMIT=$(git rev-parse HEAD)');
    // At the release commit: said in the step summary, and the step ends well.
    expect(tag).toContain('[ "$TAGGED_COMMIT" = "$RELEASE_COMMIT" ]');
    expect(tag).toMatch(/GITHUB_STEP_SUMMARY"?\s*\n\s*exit 0/);
    // Anywhere else: the release stops, naming both commits.
    expect(tag).toMatch(/\$TAGGED_COMMIT[^\n]*\$RELEASE_COMMIT[^\n]*>&2\s*\n\s*exit 1/);
  });

  it('a public release updates main and creates a GitHub release', () => {
    const { positionOf, stepNamed } = releaseSteps();
    const moveMain = stepNamed('Move main forward to the release').body;
    expect(moveMain).toMatch(SKIPPED_WHEN_ALPHA);
    expect(moveMain).toContain('git push origin HEAD:main');
    expect(positionOf('Move main forward to the release')).toBeGreaterThan(
      positionOf('Publish to npm')
    );
    // After the Action ref, which returns to the release branch when it is done.
    expect(positionOf('Move main forward to the release')).toBeGreaterThan(
      positionOf('Push the action release ref')
    );

    const release = stepNamed('Create Release').body;
    expect(release).toMatch(SKIPPED_WHEN_ALPHA);
    expect(release).toContain('tag_name: v${{ env.RELEASE_VERSION }}');
    // No notes: the release's notes are added after the publish.
    expect(release).not.toMatch(/^\s+body(_path)?:|generate_release_notes: true/m);
    expect(positionOf('Create Release')).toBeGreaterThan(positionOf('Publish to npm'));

    // The lockfile commit reaches main too.
    expect(stepNamed('Move main forward to the lockfile commit').body).toContain(
      'git push origin HEAD:main'
    );
    expect(positionOf('Move main forward to the lockfile commit')).toBeGreaterThan(
      positionOf('Commit and push updated lock files')
    );
  });
});

describe('which branches the SDK workflows run on', () => {
  it('release_to_dev starts only on a dispatch, never on a push', () => {
    const triggers = triggersOf('release_to_dev.yml');
    expect([...triggers.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1])).toEqual([
      'workflow_dispatch',
    ]);
  });

  it('pr_checks runs on a pull request into dev, a release branch or an epic branch', () => {
    const triggers = triggersOf('pr_checks.yml');
    const pullRequest = triggers.slice(triggers.search(/^ {2}pull_request:/m));
    const branches = [
      ...pullRequest
        .slice(pullRequest.search(/^ {4}branches:/m))
        .split('\n')
        .slice(1)
        .join('\n')
        .matchAll(/^ {6}- (\S+)\s*$/gm),
    ].map((match) => match[1]);
    expect(branches).toEqual(['main', 'dev', 'release/**', 'epic/**']);
  });
});
