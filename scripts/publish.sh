#!/bin/bash

VERSION=$1

yarn publish --access=public --no-git-tag-version --new-version $VERSION --cwd ./packages/react-native-storybook
