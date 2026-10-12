/**
 * THE GITHUB WORKFLOW `sherlo init` WRITES, as the file's text.
 *
 * Pure, like everything under ./: state in, the file out. Its comments are words a person - or their
 * agent - reads in their own repository, so they are drafts for the content department.
 *
 * THE PUSH RUN FOLLOWS THE REPOSITORY'S DEFAULT BRANCH, read by GitHub when the workflow runs
 * (`github.event.repository.default_branch`), so setup never guesses a branch name. A push trigger
 * cannot name a branch by an expression, so pushes to every branch start the workflow and the job
 * skips all but the default branch's - a skipped job costs nothing. A team whose pull requests merge
 * into another branch is told, in the file, where to name it.
 *
 * NO FULL-RUN SWITCH: the service photographs every story of a build on the project's main line
 * (Diff Scope's first rung), and infers that line from the repository's default branch - the same
 * branch this file runs on. So both runs are a plain `sherlo test`.
 *
 * ONE JOB PER PLATFORM, the shape of epic sherlo-test-builds-apps (operator, 2026-10-11): Android on
 * Linux, iOS on macOS, through the Sherlo Action; a platform the config names no device of ends
 * green at once, and fail-fast is off because a cancelled job never joins its test.
 *
 * NO TOKEN YET IS NOT A FAILURE (operator, 2026-10-12): setup no longer pitches CI up front, so the
 * file can sit in a repository for days before anyone saves SHERLO_TOKEN. Until then every job ends
 * green with one notice saying where the token is made, instead of failing every pull request.
 */

/** Where the workflow goes in the repository - one name for the step that writes it and the lines that name it. */
export const GITHUB_WORKFLOW_PATH = '.github/workflows/sherlo.yml';

/** The line that installs the project's packages on a clean machine, per package manager. */
const INSTALL_COMMAND: Record<string, string> = {
  npm: 'npm ci',
  yarn: 'yarn install --immutable',
  pnpm: 'pnpm install --frozen-lockfile',
  bun: 'bun install --frozen-lockfile',
};

/** The package caches setup-node knows by name; bun has none, so it gets no cache line. */
const SETUP_NODE_CACHE: Record<string, string> = { npm: 'npm', yarn: 'yarn', pnpm: 'pnpm' };

export function renderSherloWorkflow({ packageManager }: { packageManager: string }): string {
  const cache = SETUP_NODE_CACHE[packageManager];
  const cacheLine = cache ? `\n          cache: ${cache}` : '';
  return `# Sherlo visual tests, added by \`npx sherlo init\`.
#
# Sherlo photographs your app's Storybook stories on a device and shows what changed, for review.
# It needs one secret: SHERLO_TOKEN, a CI token from the Sherlo web app, added under
# Settings > Secrets and variables > Actions. Docs: https://sherlo.io/docs/testing

name: Sherlo

on:
  # Every pull request: its UI changes are reviewed next to the code that made them. Sherlo works
  # out which stories the change can affect and photographs only those, so this run is quick.
  pull_request:

  # Every push to the branch your pull requests merge into (see the job's \`if\` below): Sherlo
  # photographs every story there, because it is your project's main branch. It catches a change
  # that reached the branch without a pull request, and any story a pull request's run missed.
  push:

jobs:
  sherlo:
    # THE BRANCH YOUR PULL REQUESTS MERGE INTO - your development branch, not the one you release
    # from. This is the repository's default branch; if most pull requests merge into another one
    # (for example \`dev\`), put its name here in place of github.event.repository.default_branch,
    # and set it as the main branch in your Sherlo project's settings too.
    if: github.event_name == 'pull_request' || github.ref_name == github.event.repository.default_branch
    name: Sherlo (\${{ matrix.platform }})
    strategy:
      # A cancelled job never joins its test, which would then wait for it.
      fail-fast: false
      matrix:
        include:
          - platform: android
            runs-on: ubuntu-latest
          - platform: ios
            runs-on: macos-latest
    runs-on: \${{ matrix.runs-on }}
    env:
      SHERLO_TOKEN: \${{ secrets.SHERLO_TOKEN }}
    steps:
      # Until the SHERLO_TOKEN secret is added, the job ends here, green, with one notice.
      - name: Check the SHERLO_TOKEN secret
        id: token
        run: |
          if [ -z "$SHERLO_TOKEN" ]; then
            echo "::notice::Sherlo is not set up for pull requests yet: create a CI token in your Sherlo project's settings (https://app.sherlo.io), then add it as the SHERLO_TOKEN secret under Settings > Secrets and variables > Actions."
            echo "present=false" >> "$GITHUB_OUTPUT"
          else
            echo "present=true" >> "$GITHUB_OUTPUT"
          fi

      - if: steps.token.outputs.present == 'true'
        uses: actions/checkout@v4

      - if: steps.token.outputs.present == 'true'
        uses: actions/setup-node@v4
        with:
          node-version: 22${cacheLine}

      - name: Install packages
        if: steps.token.outputs.present == 'true'
        run: ${INSTALL_COMMAND[packageManager] ?? INSTALL_COMMAND.npm}

      - name: Run Sherlo
        if: steps.token.outputs.present == 'true'
        uses: sherlo-io/sherlo@v3
        with:
          platform: \${{ matrix.platform }}
`;
}
