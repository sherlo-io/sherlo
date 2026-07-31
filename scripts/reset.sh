#!/bin/bash
#
# Reset Script
#
# Performs a complete clean and rebuild of the entire monorepo.
# Use this when the repository is in a broken state and needs a fresh start.
#
# What it does:
#   1. Removes all node_modules and dist directories
#   2. Clears yarn cache
#   3. Reinstalls all dependencies
#   4. Builds all packages (CLI + react-native-storybook)
#   5. Installs dependencies for testing projects
#
# Usage:
#   ./scripts/reset.sh
#

APP_ROOT_DIR="$(pwd)"

echo "🧹 Starting full repository reset..."
echo ""

echo "Removing node_modules and dist directories..."
rm -rf node_modules || true
rm -rf packages/*/node_modules || true
rm -rf packages/*/dist || true
rm -rf testing/*/node_modules || true
rm -rf testing/*/dist || true
echo "✓ Cleaned up node_modules and dist directories"
echo ""

echo "Clearing yarn cache..."
yarn cache clean
echo "✓ Yarn cache cleaned"
echo ""

echo "Installing root dependencies..."
yarn
echo "✓ Root dependencies installed"
echo ""

echo "Building all packages..."
yarn build
echo "✓ All packages built"
echo ""

echo "Packing react-native-storybook SDK..."
mkdir -p "$APP_ROOT_DIR/testing/expo/sherlo-lib" "$APP_ROOT_DIR/testing/react-native/sherlo-lib"
(cd "$APP_ROOT_DIR/packages/react-native-storybook" && yarn pack --out ../../testing/expo/sherlo-lib/react-native-storybook.tgz)
cp "$APP_ROOT_DIR/testing/expo/sherlo-lib/react-native-storybook.tgz" "$APP_ROOT_DIR/testing/react-native/sherlo-lib/react-native-storybook.tgz"
echo "✓ SDK packed to testing/*/sherlo-lib/react-native-storybook.tgz"
echo ""

echo "Installing dependencies for testing/expo..."
cd "$APP_ROOT_DIR/testing/expo" && yarn install
echo "✓ Testing/expo dependencies installed"
echo ""

echo "Installing dependencies for testing/react-native..."
cd "$APP_ROOT_DIR/testing/react-native" && yarn install
echo "✓ Testing/react-native dependencies installed"
echo ""

echo "🎉 Repository reset complete!"
