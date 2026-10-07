/**
 * THE GITHUB WORKFLOW `sherlo init` WRITES, as the file's text.
 *
 * Pure, like everything under ./: state in, the file out. Its comments are words a person reads in
 * their own repository, so they are drafts for the content department.
 *
 * OPEN (the `sherlo test` build epic): the input that makes a push to main rebuild the app and
 * photograph every story. Drawn here as `full`, the name that epic settles.
 */

/** The line that installs the project's packages on a clean machine, per package manager. */
const INSTALL_COMMAND: Record<string, string> = {
  npm: 'npm ci',
  yarn: 'yarn install --immutable',
  pnpm: 'pnpm install --frozen-lockfile',
  bun: 'bun install --frozen-lockfile',
};

export function renderSherloWorkflow({
  packageManager,
  mainBranch,
}: {
  packageManager: string;
  /** The branch whose pushes test everything. */
  mainBranch: string;
}): string {
  return `# Sherlo visual tests, added by \`npx sherlo init\`.
#
# Sherlo photographs your app's Storybook stories on a device and shows what changed, for review.
# It needs one secret: SHERLO_TOKEN, a project token from the Sherlo web app, added under
# Settings > Secrets and variables > Actions. Docs: https://sherlo.io/docs/testing

name: Sherlo

on:
  # Every pull request: its UI changes are reviewed next to the code that made them. Sherlo works
  # out which stories the change can affect and photographs only those, so this run is quick.
  pull_request:

  # Every push to ${mainBranch}: a change can reach ${mainBranch} without a pull request, and then
  # nobody saw its UI. This run rebuilds the app and photographs every story, so nothing is missed.
  push:
    branches: [${mainBranch}]

jobs:
  sherlo:
    runs-on: ubuntu-latest
    env:
      SHERLO_TOKEN: \${{ secrets.SHERLO_TOKEN }}
    steps:
      - name: Check the SHERLO_TOKEN secret
        run: |
          if [ -z "$SHERLO_TOKEN" ]; then
            echo "::error::Add a SHERLO_TOKEN secret: create a project token in the Sherlo web app (https://app.sherlo.io), then add it under Settings > Secrets and variables > Actions."
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
          token: \${{ secrets.SHERLO_TOKEN }}
          full: \${{ github.event_name == 'push' }}
`;
}
