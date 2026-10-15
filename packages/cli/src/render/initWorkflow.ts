/**
 * THE GITHUB WORKFLOW `sherlo init` WRITES, as the file's text.
 *
 * Pure, like everything under ./: state in, the file out. Its comments are words a person - or their
 * agent - reads in their own repository.
 *
 * THE SHAPE IS THE ONE THE DOCS GIVE AND THE ACTION TAKES: a matrix job, Android on `ubuntu-latest`
 * and iOS on `macos-latest`, `SHERLO_TOKEN` in the job's env, and the action told only its
 * `platform` - the token is not one of the action's inputs (see `action.yml`).
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

export function renderSherloWorkflow({ packageManager }: { packageManager: string }): string {
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
    # One job per platform: iOS builds only on macOS. The two jobs join into one test.
    strategy:
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
      - name: Check the SHERLO_TOKEN secret
        run: |
          if [ -z "$SHERLO_TOKEN" ]; then
            echo "::error::Add a SHERLO_TOKEN secret: create a CI token in the Sherlo web app (https://app.sherlo.io), then add it under Settings > Secrets and variables > Actions."
            exit 1
          fi

      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: lts/*

      - name: Install packages
        run: ${INSTALL_COMMAND[packageManager] ?? INSTALL_COMMAND.npm}

      - name: Run Sherlo
        uses: sherlo-io/sherlo@v3
        with:
          platform: \${{ matrix.platform }}
`;
}
