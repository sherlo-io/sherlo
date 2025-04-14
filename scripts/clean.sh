#!/bin/bash

APP_ROOT_DIR="$(pwd)"

rm -rf node_modules || true && 
rm -rf packages/*/node_modules || true && 
rm -rf packages/*/dist || true && 
rm -rf testing/*/node_modules || true && 
rm -rf testing/*/dist || true && 
echo "Cleaned up node_modules and dist directories"

yarn cache clean && 
echo "Cleaned up yarn cache"

yarn &&
echo "Installed dependencies"

cd "$APP_ROOT_DIR/packages/cli" && yarn build &&
echo "Built the CLI project"

cd "$APP_ROOT_DIR/testing/expo-storybook-8" && yarn &&
echo "Installed dependencies for expo-storybook-8"

cd "$APP_ROOT_DIR/testing/rn-storybook-7" && yarn &&
echo "Installed dependencies for rn-storybook-7"
