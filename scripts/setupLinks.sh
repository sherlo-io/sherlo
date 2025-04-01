#!/bin/bash

ROOT_DIR="$(pwd)"

echo "Root directory: $ROOT_DIR"

REACT_NATIVE_STORYBOOK="${ROOT_DIR}/packages/react-native-storybook"
SHERLO_CLI="${ROOT_DIR}/packages/cli"
TESTING_COMPONENTS="${ROOT_DIR}/testing/testing-components"
EXPO_STORYBOOK="${ROOT_DIR}/testing/expo-storybook-8"
RN_STORYBOOK="${ROOT_DIR}/testing/rn-storybook-7"

echo "Installing dependencies..."
cd "$EXPO_STORYBOOK" && yarn
cd "$RN_STORYBOOK" && yarn

# We don't build the @sherlo/react-native-storybook package to avoid Metro resolution issues
cd "$TESTING_COMPONENTS" && yarn build
cd "$SHERLO_CLI" && yarn build

# Clear  @sherlo/react-native-storybook dist folders to avoid Metro resolution issues if it was already built
echo "Clear dist folders..."
rm -rf "$REACT_NATIVE_STORYBOOK/dist"

echo "Linking shared packages..."
cd "$REACT_NATIVE_STORYBOOK" && yarn link
cd "$TESTING_COMPONENTS" && yarn link

echo "Linking shared packages into expo-storybook-8..."
cd "$EXPO_STORYBOOK" && \
yarn link @sherlo/react-native-storybook && \
yarn link @sherlo/testing-components && \
ln -sf "$SHERLO_CLI/bin/sherlo.js" "node_modules/.bin/sherlo"

echo "Linking shared packages into rn-storybook-7..."
cd "$RN_STORYBOOK" && \
yarn link @sherlo/react-native-storybook && \
yarn link @sherlo/testing-components && \
ln -sf "$SHERLO_CLI/bin/sherlo.js" "node_modules/.bin/sherlo"



