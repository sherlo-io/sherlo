#!/usr/bin/env bash
set -euo pipefail

# Build the CLI copy the GitHub Action carries, at actions/carried-cli.
#
# WHY IT EXISTS. `uses: sherlo-io/sherlo@<ref>` gives a job the action's files and
# nothing else. When the job has no Sherlo CLI installed - no install step at all -
# the action runs this copy instead (actions/lib/cliEntry.mjs). A release ref commits
# the tree this script writes; on every other ref it does not exist, and the action
# needs the project's own install as before.
#
# THE LAYOUT IS AN ORDINARY INSTALL: actions/carried-cli/node_modules/sherlo, with
# the CLI's one runtime dependency beside it. That is the same shape a project's
# install has, which is why one resolver finds both.
#
# Usage: scripts/build-carried-cli.sh <version>
#   <version> is stamped into the carried package.json, so the action's log names the
#   release the copy came from. Run it AFTER `yarn build` (it copies the built dist).

VERSION="${1:?usage: build-carried-cli.sh <version>}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="$REPO_ROOT/packages/cli"
CARRIED_ROOT="$REPO_ROOT/actions/carried-cli"
CARRIED_CLI_DIR="$CARRIED_ROOT/node_modules/sherlo"

if [ ! -d "$CLI_DIR/dist" ]; then
  echo "packages/cli/dist is missing - run \`yarn build\` before this script." >&2
  exit 1
fi

rm -rf "$CARRIED_ROOT"
mkdir -p "$CARRIED_ROOT"

# The CLI's runtime dependencies first, into the carried root. Installing them after
# the CLI itself was copied in would let npm prune it as extraneous.
cat > "$CARRIED_ROOT/package.json" <<EOF
{
  "name": "sherlo-action-carried-cli",
  "version": "$VERSION",
  "private": true,
  "description": "The Sherlo CLI this action runs when the project has none installed. Built by scripts/build-carried-cli.sh on a release ref."
}
EOF

node -e "
  const fs = require('fs');
  const cli = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  const dependencies = Object.entries(cli.dependencies ?? {}).map(([name, range]) => name + '@' + range);
  fs.writeFileSync(process.argv[2], dependencies.join('\n'));
" "$CLI_DIR/package.json" "$CARRIED_ROOT/runtime-dependencies.txt"

if [ -s "$CARRIED_ROOT/runtime-dependencies.txt" ]; then
  # shellcheck disable=SC2046
  npm install --prefix "$CARRIED_ROOT" --omit=dev --no-audit --no-fund $(cat "$CARRIED_ROOT/runtime-dependencies.txt")
fi
rm -f "$CARRIED_ROOT/runtime-dependencies.txt"

# Then the CLI itself, as an installed package: the files its `files` field publishes,
# under the name `sherlo`, which is the directory name every install shape uses.
mkdir -p "$CARRIED_CLI_DIR"
cp -R "$CLI_DIR/dist" "$CARRIED_CLI_DIR/dist"
cp "$CLI_DIR/cli.js" "$CARRIED_CLI_DIR/cli.js"
if [ -f "$CLI_DIR/sdk-compatibility.json" ]; then
  cp "$CLI_DIR/sdk-compatibility.json" "$CARRIED_CLI_DIR/sdk-compatibility.json"
fi

node -e "
  const fs = require('fs');
  const cli = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  // The carried copy is always named \`sherlo\`, whatever channel published this
  // release: the action looks up the DIRECTORY, and the log reads better for it.
  cli.name = 'sherlo';
  cli.version = process.argv[3];
  delete cli.devDependencies;
  delete cli.scripts;
  delete cli.publishConfig;
  fs.writeFileSync(process.argv[2], JSON.stringify(cli, null, 2) + '\n');
" "$CLI_DIR/package.json" "$CARRIED_CLI_DIR/package.json" "$VERSION"

echo "Carried CLI built at actions/carried-cli (sherlo@$VERSION)"
du -sh "$CARRIED_ROOT"
