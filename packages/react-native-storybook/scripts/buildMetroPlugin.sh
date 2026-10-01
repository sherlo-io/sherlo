#!/usr/bin/env bash
# Builds the bundler plugin the package publishes: metro/withStorybook.js and every metro/ file it
# requires become one minified file, and metro/polyfill.js - which Metro pastes into the app bundle
# as a bare script, where no module or require exists - is minified on its own as a plain script. The readable sources in metro/ are never published.
# Packages that live in the customer's own project stay external: they are resolved there at run time.
set -euo pipefail
cd "$(dirname "$0")/.."

OUTPUT_DIR=dist-metro
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

rm -rf "$OUTPUT_DIR"
mkdir "$OUTPUT_DIR"

yarn run ncc build metro/withStorybook.js --minify --out "$WORK_DIR/withStorybook" \
  --external @storybook/react-native/metro/withStorybook \
  --external @storybook/react-native/withStorybook \
  --external @babel/parser \
  --external metro-babel-transformer/node_modules/@babel/parser \
  --external metro/package.json \
  --external metro/src/DeltaBundler/Serializers/baseJSBundle \
  --external metro/src/lib/bundleToString

mv "$WORK_DIR/withStorybook/index.js" "$OUTPUT_DIR/withStorybook.js"
# The polyfill is only minified, never wrapped as a module. toplevel stays off so its writes to
# global names keep those names. terser is one of this package's own devDependencies.
node "$(node -p "require.resolve('terser/bin/terser')")" metro/polyfill.js --compress toplevel=false --mangle toplevel=false \
  --output "$OUTPUT_DIR/polyfill.js"
