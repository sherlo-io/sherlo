#!/usr/bin/env bash
# Builds the bundler plugin the package publishes: metro/withStorybook.js and every metro/ file it
# requires become one minified file, and metro/polyfill.js - which Metro loads by path into the app
# bundle - becomes a second minified file. The readable sources in metro/ are never published.
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
yarn run ncc build metro/polyfill.js --minify --out "$WORK_DIR/polyfill"

mv "$WORK_DIR/withStorybook/index.js" "$OUTPUT_DIR/withStorybook.js"
mv "$WORK_DIR/polyfill/index.js" "$OUTPUT_DIR/polyfill.js"
