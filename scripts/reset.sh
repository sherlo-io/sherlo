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
#   5. Packs the SDK into the testing projects and installs their dependencies
#
# The SDK's pack fetches the pinned core (packages/react-native-storybook/sherlo-core.json) from
# package storage, so PACKAGE_TOKEN must be set: in the environment, or in the repo's .env (the
# same file scripts/init-env.sh reads it from).
#
# Usage:
#   ./scripts/reset.sh
#

if [ -z "${PACKAGE_TOKEN:-}" ] && [ -f .env ]; then
  set -a
  source .env
  set +a
fi
if [ -z "${PACKAGE_TOKEN:-}" ]; then
  echo "Error: PACKAGE_TOKEN is set neither in the environment nor in .env. The SDK's pack fetches the pinned core with it, so set it and run again." >&2
  exit 1
fi

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

echo "Packing the SDK into the testing apps and installing them..."
bash "$APP_ROOT_DIR/scripts/pack-testing-apps.sh"
echo ""

echo "🎉 Repository reset complete!"
